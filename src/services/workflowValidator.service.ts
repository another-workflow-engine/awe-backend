import { NodeTypes } from "../types/enums.js";
import { v4 as uuidv4 } from "uuid";
import { nodeSchemaService } from "./nodeSchema.service.js";
import type { EdgeModel, NodeModel } from "../types/models.js";
import {
  DecisionNodeConfigurationSchema,
  EndNodeConfigurationSchema,
  ScriptNodeConfigurationSchema,
  ServiceNodeConfigurationSchema,
  StartNodeConfigurationSchema,
  UserNodeConfigurationSchema,
} from "../schemas/node.schema.js";
import { converterUtils } from "../utils/converter.utils.js";
import {
  validateConditionExpression,
  validateFeelExpression,
  validateUrlExpression,
} from "../utils/feel.utils.js";
import { graphUtils } from "../utils/graph.utils.js";
import { parser as pythonParser } from "@lezer/python";
import { JSONPath } from "jsonpath-plus";

export type ValidationError = {
  code: number;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export enum ValidationErrorCode {
  START_NODE_MISSING_OR_MULTIPLE,
  END_NODE_MISSING,

  EDGE_TARGET_NODE_MISSING,
  EDGE_SOURCE_AND_TARGET_EQUAL,
  EDGE_SOURCE_NODE_IS_END,
  EDGE_TARGET_NODE_IS_START,

  WORKFLOW_CONTAINS_CYCLE,
  UNREACHABLE_NODE,
  DEAD_END_NODE,

  NODE_MISSING_REQUIRED_CONFIGURATION,
  INVALID_FEEL_EXPRESSION,

  DECISION_NODE_MISSING_RULES,
  DECISION_MISSING_DEFAULT_EDGE,
  DECISION_RULES_EDGE_MISMATCH,

  EDGE_REFERENCED_NODE_MISSING,
  INVALID_CONTEXT_VARIABLE_REFERENCE,
  INVALID_JSON_PATH,
  INVALID_PYTHON_CODE,
  SCRIPT_ENTRY_FUNCTION_MISSING,
  SCRIPT_PARAM_INVALID,
  OUTPUT_SCHEMA_VARIABLE_UNASSIGNED,
  INVALID_OUTGOING_EDGE_COUNT,
}

type ExpressionValidator = (expr: string) => { valid: boolean; error?: string };

const CONTEXT_REFERENCE_REGEX = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

const JSONPATH_REGEX =
/^\$(?:\.(?:[a-zA-Z_][a-zA-Z0-9_-]*|\*)|\[(?:\d+|\*|'[^']+'|"[^"]+")\]|\.\.)*$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractContextReferences(expression: string): string[] {
  const refs = new Set<string>();
  for (const match of expression.matchAll(CONTEXT_REFERENCE_REGEX)) {
    if (match[1]) refs.add(match[1]);
  }
  return [...refs];
}

function getNodeInputVariables(node: NodeModel): Set<string> {
  if (!node.input_schema) {
    return new Set<string>();
  }

  const parsedSchema = converterUtils.jsonValueToNodeInputSchema(
    node.input_schema,
  );
  return new Set(parsedSchema.variableNames);
}

function getNodeOutputVariables(node: NodeModel): Set<string> {
  if (!node.output_schema) {
    return new Set<string>();
  }

  const parsedSchema = converterUtils.jsonValueToNodeInputSchema(
    node.output_schema,
  );
  return new Set(parsedSchema.variableNames);
}

function validateContextReferences(
  expression: string | undefined,
  nodeId: string,
  messagePrefix: string,
  inputVariables: Set<string>,
  errors: ValidationError[],
): void {
  if (!expression?.trim()) return;

  const missing = extractContextReferences(expression).filter(
    (name) => !inputVariables.has(name),
  );

  if (missing.length > 0) {
    errors.push({
      code: ValidationErrorCode.INVALID_CONTEXT_VARIABLE_REFERENCE,
      message: `${messagePrefix} - unknown context variable(s): ${missing.join(", ")}`,
      nodeId,
    });
  }
}

function isValidJsonPath(path: string): boolean {
  if (!path) return false;
  return JSONPATH_REGEX.test(path.trim());
}

function validateJsonPath(
  jsonPath: string | undefined,
  nodeId: string,
  message: string,
  errors: ValidationError[],
): boolean {
  if (!jsonPath?.trim()) {
    errors.push({
      code: ValidationErrorCode.INVALID_JSON_PATH,
      message,
      nodeId,
    });
    return false;
  }

  if (!isValidJsonPath(jsonPath)) {
    errors.push({
      code: ValidationErrorCode.INVALID_JSON_PATH,
      message: `${message} - must be a valid JSONPath expression`,
      nodeId,
    });
    return false;
  }

  return true;
}

function validateOutputAssignments(
  node: NodeModel,
  assignedVariables: Set<string>,
  errors: ValidationError[],
): void {
  const outputVariables = getNodeOutputVariables(node);
  if (outputVariables.size === 0) return;

  const missing = [...outputVariables].filter(
    (name) => !assignedVariables.has(name),
  );
  if (missing.length > 0) {
    errors.push({
      code: ValidationErrorCode.OUTPUT_SCHEMA_VARIABLE_UNASSIGNED,
      message: `Output schema variable(s) are not assigned: ${missing.join(", ")}`,
      nodeId: node.client_id,
    });
  }
}

function validatePythonSourceCodeSyntax(sourceCode: string): string | null {
  if (!sourceCode.trim()) {
    return "Source code is empty";
  }

  try {
    const tree = pythonParser.parse(sourceCode);
    const cursor = tree.cursor();

    do {
      if (!cursor.type.isError) {
        continue;
      }

      const line = sourceCode.slice(0, cursor.from).split(/\r?\n/).length;
      return `Invalid Python syntax near line ${line}`;
    } while (cursor.next());

    return null;
  } catch (error) {
    return error instanceof Error
      ? `Invalid Python syntax: ${error.message}`
      : "Invalid Python syntax";
  }
}

function getPythonFunctionInfo(
  sourceCode: string,
  functionName: string,
): { params: string[]; body: string } | null {
  const pattern = new RegExp(
    String.raw`(^|\n)([ \t]*)def\s+${escapeRegExp(functionName)}\s*\(([^)]*)\)\s*:`,
    "m",
  );
  const match = pattern.exec(sourceCode);
  if (!match) return null;

  const signature = match[3] ?? "";
  const params = signature
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^\*\*?/, "")
        .split("=")[0]
        ?.split(":")[0]
        ?.trim(),
    )
    .filter((part): part is string => Boolean(part));

  const indent = (match[2] ?? "").length;
  const afterDef = sourceCode.slice((match.index ?? 0) + match[0].length);
  const lines = afterDef.split(/\r?\n/);
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      bodyLines.push(line);
      continue;
    }

    const lineIndent = (line.match(/^[ \t]*/) ?? [""])[0].length;
    if (lineIndent <= indent) {
      break;
    }

    bodyLines.push(line);
  }

  return {
    params,
    body: bodyLines.join("\n"),
  };
}

function isIdentifierUsedInBody(identifier: string, body: string): boolean {
  if (!identifier.trim()) return false;
  const regex = new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "m");
  return regex.test(body);
}

function validateExpression(
  expression: string | undefined,
  nodeId: string,
  messagePrefix: string,
  errors: ValidationError[],
  validator: ExpressionValidator = validateFeelExpression,
  inputVariables?: Set<string>,
): void {
  if (!expression?.trim()) return;

  const result = validator(expression);
  if (!result.valid) {
    errors.push({
      code: ValidationErrorCode.INVALID_FEEL_EXPRESSION,
      message: `${messagePrefix} - ${result.error}`,
      nodeId,
    });
    return;
  }

  if (inputVariables) {
    validateContextReferences(
      expression,
      nodeId,
      messagePrefix,
      inputVariables,
      errors,
    );
  }
}

function validateRequired(
  value: string | undefined,
  nodeId: string,
  message: string,
  errors: ValidationError[],
): boolean {
  if (!value?.trim()) {
    errors.push({
      code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
      message,
      nodeId,
    });
    return false;
  }
  return true;
}

function validateHeaders(
  headers: Array<{ valueExpression: string }> | undefined,
  nodeId: string,
  messagePrefix: string,
  errors: ValidationError[],
  inputVariables?: Set<string>,
): void {
  headers?.forEach((header, index) => {
    validateExpression(
      header.valueExpression,
      nodeId,
      `${messagePrefix} header ${index + 1}: invalid value expression`,
      errors,
      validateFeelExpression,
      inputVariables,
    );
  });
}

function calculateDataFlow(
  nodes: NodeModel[],
  edges: EdgeModel[],
): Map<string, Set<string>> {
  const graph = graphUtils.buildGraph(nodes, edges);

  const incomingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.destination_node_id) continue;
    const list = incomingEdges.get(edge.destination_node_id) ?? [];
    list.push(edge.source_node_id);
    incomingEdges.set(edge.destination_node_id, list);
  }

  const queue: string[] = [];
  const inDegree = new Map(graph.incoming);

  for (const [id, count] of inDegree) {
    if (count === 0) queue.push(id);
  }

  const nodeOutputs = new Map<string, Set<string>>();
  for (const node of nodes) {
    nodeOutputs.set(node.id, getNodeOutputVariables(node));
  }

  const nodeInputs = new Map<string, Set<string>>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    const incomings = incomingEdges.get(nodeId) ?? [];
    let availableIncoming = new Set<string>();

    if (incomings.length > 0) {
      const incomingSets = incomings.map((inc) => {
        const provided = new Set(nodeInputs.get(inc) ?? new Set<string>());
        const outputs = nodeOutputs.get(inc) ?? new Set<string>();
        for (const out of outputs) provided.add(out);
        return provided;
      });

      availableIncoming = new Set(Array.from(incomingSets[0]!));
      for (let i = 1; i < incomingSets.length; i++) {
        const nextSet = incomingSets[i]!;
        for (const item of availableIncoming) {
          if (!nextSet.has(item)) availableIncoming.delete(item);
        }
      }
    }

    nodeInputs.set(nodeId, availableIncoming);

    for (const next of graph.adjacency.get(nodeId) ?? []) {
      const count = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, count);
      if (count === 0) queue.push(next);
    }
  }

  return nodeInputs;
}

function validateStartNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const assignedOutputs = new Set<string>();
  const config = converterUtils.parseOrThrow(
    StartNodeConfigurationSchema,
    node.configuration,
  );

  config.inputDataMap.forEach((entry, index) => {
    validateJsonPath(
      entry.jsonPath,
      node.client_id,
      `Start node input ${index + 1}: jsonPath is invalid`,
      errors,
    );

    const hasContextName = validateRequired(
      entry.contextVariableName,
      node.client_id,
      `Start node input ${index + 1}: context variable name must not be empty`,
      errors,
    );
    if (hasContextName) {
      assignedOutputs.add(entry.contextVariableName.trim());
    }
  });

  config.fetchables.forEach((fetchable, index) => {
    validateExpression(
      fetchable.urlExpression,
      node.client_id,
      `Start node fetchable ${index + 1}: invalid URL expression`,
      errors,
      validateUrlExpression,
      inputVariables,
    );
    validateHeaders(
      fetchable.headers,
      node.client_id,
      `Start node fetchable ${index + 1}`,
      errors,
      inputVariables,
    );
  });
  validateOutputAssignments(node, assignedOutputs, errors);
  return errors;
}

function validateEndNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = converterUtils.parseOrThrow(
    EndNodeConfigurationSchema,
    node.configuration,
  );

  config.resultMap.forEach((entry, index) => {
    validateRequired(
      entry.variableName,
      node.client_id,
      `End node result ${index + 1}: variable name must not be empty`,
      errors,
    );

    const hasValue = validateRequired(
      entry.valueExpression,
      node.client_id,
      `End node result ${index + 1}: value expression must not be empty`,
      errors,
    );

    if (hasValue) {
      validateExpression(
        entry.valueExpression,
        node.client_id,
        `End node result ${index + 1}: invalid value expression`,
        errors,
        validateFeelExpression,
        inputVariables,
      );
    }
  });

  return errors;
}

function validateUserNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const assignedOutputs = new Set<string>();
  const config = converterUtils.parseOrThrow(
    UserNodeConfigurationSchema,
    node.configuration,
  );

  config.requestMap.forEach((entry, index) => {
    const hasValue = validateRequired(
      entry.valueExpression,
      node.client_id,
      `User task request field ${index + 1}: value expression must not be empty`,
      errors,
    );

    if (hasValue) {
      validateExpression(
        entry.valueExpression,
        node.client_id,
        `User task request field ${index + 1}: invalid value expression`,
        errors,
        validateFeelExpression,
        inputVariables,
      );
    }
  });

  config.responseMap.forEach((entry, index) => {
    validateRequired(
      entry.fieldId,
      node.client_id,
      `User task response field ${index + 1}: field ID must not be empty`,
      errors,
    );

    const hasContextName = validateRequired(
      entry.contextVariableName,
      node.client_id,
      `User task response field ${index + 1}: context variable name must not be empty`,
      errors,
    );
    if (hasContextName) {
      assignedOutputs.add(entry.contextVariableName.trim());
    }

    entry.options?.forEach((option, optionIndex) => {
      validateExpression(
        option.valueExpression,
        node.client_id,
        `User task response field ${index + 1} option ${optionIndex + 1}: invalid value expression`,
        errors,
        validateFeelExpression,
        inputVariables,
      );
    });
  });

  validateExpression(
    config.assignee,
    node.client_id,
    "User task: invalid assignee expression",
    errors,
    validateFeelExpression,
    inputVariables,
  );

  validateOutputAssignments(node, assignedOutputs, errors);

  return errors;
}

function validateServiceNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const assignedOutputs = new Set<string>();

  const config = converterUtils.parseOrThrow(
    ServiceNodeConfigurationSchema,
    node.configuration,
  );

  const hasUrl = validateRequired(
    config.urlExpression,
    node.client_id,
    "Service task URL expression must not be empty",
    errors,
  );

  if (hasUrl) {
    validateExpression(
      config.urlExpression,
      node.client_id,
      "Service task: invalid URL expression",
      errors,
      validateUrlExpression,
      inputVariables,
    );
  }

  config.body?.forEach((entry, index) => {
    validateJsonPath(
      entry.jsonPath,
      node.client_id,
      `Service task body field ${index + 1}: jsonPath is invalid`,
      errors,
    );

    validateExpression(
      entry.valueExpression,
      node.client_id,
      `Service task body field ${index + 1}: invalid value expression`,
      errors,
      validateFeelExpression,
      inputVariables,
    );
  });

  validateHeaders(
    config.headers,
    node.client_id,
    "Service task",
    errors,
    inputVariables,
  );

  config.responseMap.forEach((entry, index) => {
    validateJsonPath(
      entry.jsonPath,
      node.client_id,
      `Service task response field ${index + 1}: jsonPath is invalid`,
      errors,
    );

    const hasContextName = validateRequired(
      entry.contextVariableName,
      node.client_id,
      `Service task response field ${index + 1}: context variable name must not be empty`,
      errors,
    );

    if (hasContextName) {
      assignedOutputs.add(entry.contextVariableName.trim());
    }
  });

  validateOutputAssignments(node, assignedOutputs, errors);

  return errors;
}

function validateScriptNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const assignedOutputs = new Set<string>();
  const config = converterUtils.parseOrThrow(
    ScriptNodeConfigurationSchema,
    node.configuration,
  );

  const hasSourceCode = validateRequired(
    config.sourceCode,
    node.client_id,
    "Script task source code must not be empty",
    errors,
  );

  const hasEntryFunction = validateRequired(
    config.entryFunctionName,
    node.client_id,
    "Script task entry function name must not be empty",
    errors,
  );

  if (hasSourceCode) {
    const syntaxError = validatePythonSourceCodeSyntax(config.sourceCode);
    if (syntaxError) {
      errors.push({
        code: ValidationErrorCode.INVALID_PYTHON_CODE,
        message: `Script task source code is not syntactically valid: ${syntaxError}`,
        nodeId: node.client_id,
      });
    }
  }

  let functionInfo: { params: string[]; body: string } | null = null;
  if (hasSourceCode && hasEntryFunction) {
    functionInfo = getPythonFunctionInfo(
      config.sourceCode,
      config.entryFunctionName,
    );

    if (!functionInfo) {
      errors.push({
        code: ValidationErrorCode.SCRIPT_ENTRY_FUNCTION_MISSING,
        message: `Script task entry function '${config.entryFunctionName}' does not exist in source code`,
        nodeId: node.client_id,
      });
    }
  }

  const mappedParams = new Set<string>();
  config.parameterMap.forEach((parameter, index) => {
    const hasName = validateRequired(
      parameter.name,
      node.client_id,
      `Script task parameter ${index + 1}: name must not be empty`,
      errors,
    );

    const hasValue = validateRequired(
      parameter.valueExpression,
      node.client_id,
      `Script task parameter ${index + 1}: value expression must not be empty`,
      errors,
    );

    if (hasValue) {
      validateExpression(
        parameter.valueExpression,
        node.client_id,
        `Script task parameter ${index + 1}: invalid value expression`,
        errors,
        validateFeelExpression,
        inputVariables,
      );
    }

    if (!hasName) return;

    const paramName = parameter.name.trim();
    mappedParams.add(paramName);

    if (functionInfo && !functionInfo.params.includes(paramName)) {
      errors.push({
        code: ValidationErrorCode.SCRIPT_PARAM_INVALID,
        message: `Script task parameter '${paramName}' is not defined in entry function '${config.entryFunctionName}'`,
        nodeId: node.client_id,
      });
    }

    if (functionInfo && !isIdentifierUsedInBody(paramName, functionInfo.body)) {
      errors.push({
        code: ValidationErrorCode.SCRIPT_PARAM_INVALID,
        message: `Script task parameter '${paramName}' is not used in entry function body`,
        nodeId: node.client_id,
      });
    }
  });

  if (functionInfo) {
    for (const functionParam of functionInfo.params) {
      if (!mappedParams.has(functionParam)) {
        errors.push({
          code: ValidationErrorCode.SCRIPT_PARAM_INVALID,
          message: `Script task entry function parameter '${functionParam}' has no parameterMap mapping`,
          nodeId: node.client_id,
        });
      }
    }
  }

  config.responseMap.forEach((entry, index) => {
    validateJsonPath(
      entry.jsonPath,
      node.client_id,
      `Script task response field ${index + 1}: jsonPath is invalid`,
      errors,
    );

    const hasContextName = validateRequired(
      entry.contextVariableName,
      node.client_id,
      `Script task response field ${index + 1}: context variable name must not be empty`,
      errors,
    );

    if (hasContextName) {
      assignedOutputs.add(entry.contextVariableName.trim());
    }
  });

  validateOutputAssignments(node, assignedOutputs, errors);

  return errors;
}

function validateDecisionNode(node: NodeModel, inputVariables: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = converterUtils.parseOrThrow(
    DecisionNodeConfigurationSchema,
    node.configuration,
  );

  if (config.rules.length === 0) {
    errors.push({
      code: ValidationErrorCode.DECISION_NODE_MISSING_RULES,
      message: "Decision node must have at least one conditional rule",
      nodeId: node.client_id,
    });
    return errors;
  }

  config.rules.forEach((rule, index) => {
    const hasCondition = validateRequired(
      rule.conditionExpression,
      node.client_id,
      `Decision node rule ${index + 1}: condition expression must not be empty`,
      errors,
    );

    if (hasCondition) {
      validateExpression(
        rule.conditionExpression,
        node.client_id,
        `Decision node rule ${index + 1}: invalid condition expression`,
        errors,
        validateConditionExpression,
        inputVariables,
      );
    }
  });

  return errors;
}

export const workflowValidatorService = {
  validate: (nodes: NodeModel[], edges: EdgeModel[]): ValidationResult => {
    const errors = [
      ...workflowValidatorService.validateAllNodes(nodes, edges),
      ...workflowValidatorService.validateAllEdges(nodes, edges),
    ];

    if (errors.length === 0) {
      errors.push(
        ...workflowValidatorService.validateDecisionEdges(nodes, edges),
        ...workflowValidatorService.validateGraph(nodes, edges),
      );
    }

    return { valid: errors.length === 0, errors };
  },

  validateAllNodes: (nodes: NodeModel[], edges: EdgeModel[]): ValidationError[] => {
    const errors: ValidationError[] = [];
    let startNodes = 0;
    let endNodes = 0;

    const availableVariables = calculateDataFlow(nodes, edges);

    const validators: Record<string, (node: NodeModel, vars: Set<string>) => ValidationError[]> = {
      [NodeTypes.START]: validateStartNode,
      [NodeTypes.END]: validateEndNode,
      [NodeTypes.USER]: validateUserNode,
      [NodeTypes.SERVICE]: validateServiceNode,
      [NodeTypes.SCRIPT]: validateScriptNode,
      [NodeTypes.DECISION]: validateDecisionNode,
    };

    for (const node of nodes) {
      if (node.type === NodeTypes.START) startNodes += 1;
      if (node.type === NodeTypes.END) endNodes += 1;

      const validator = validators[node.type];
      if (validator) {
        const inputVars = availableVariables.get(node.id) ?? new Set<string>();
        errors.push(...validator(node, inputVars));
      }
    }

    if (startNodes !== 1) {
      errors.push({
        code: ValidationErrorCode.START_NODE_MISSING_OR_MULTIPLE,
        message: "Workflow must contain exactly one start node",
      });
    }

    if (endNodes === 0) {
      errors.push({
        code: ValidationErrorCode.END_NODE_MISSING,
        message: "Workflow must contain at least one end node",
      });
    }

    return errors;
  },

  validateAllEdges: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    for (const edge of edges) {
      if (!edge.destination_node_id) {
        errors.push({
          code: ValidationErrorCode.EDGE_TARGET_NODE_MISSING,
          message: "Every edge must have a target node",
          edgeId: edge.client_id,
        });
        continue;
      }

      const targetNode = nodeMap.get(edge.destination_node_id);
      if (!targetNode) {
        errors.push({
          code: ValidationErrorCode.EDGE_REFERENCED_NODE_MISSING,
          message: `Edge target node does not exist: ${edge.destination_node_id}`,
          edgeId: edge.client_id,
        });
        continue;
      }

      if (targetNode.type === NodeTypes.START) {
        errors.push({
          code: ValidationErrorCode.EDGE_TARGET_NODE_IS_START,
          message: "Edge cannot target start node",
          edgeId: edge.client_id,
          nodeId: targetNode.client_id,
        });
      }

      if (edge.source_node_id === edge.destination_node_id) {
        errors.push({
          code: ValidationErrorCode.EDGE_SOURCE_AND_TARGET_EQUAL,
          message: "Source and target nodes cannot be same",
          edgeId: edge.client_id,
        });
      }

      const sourceNode = nodeMap.get(edge.source_node_id);
      if (!sourceNode) {
        errors.push({
          code: ValidationErrorCode.EDGE_REFERENCED_NODE_MISSING,
          message: `Edge source node does not exist: ${edge.source_node_id}`,
          edgeId: edge.client_id,
        });
        continue;
      }

      if (sourceNode.type === NodeTypes.END) {
        errors.push({
          code: ValidationErrorCode.EDGE_SOURCE_NODE_IS_END,
          message: "Edge cannot originate from end node",
          edgeId: edge.client_id,
          nodeId: sourceNode.client_id,
        });
      }
    }

    return errors;
  },

  validateDecisionEdges: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];

    const outgoingEdges = new Map<string, EdgeModel[]>();
    for (const edge of edges) {
      const group = outgoingEdges.get(edge.source_node_id) ?? [];
      group.push(edge);
      outgoingEdges.set(edge.source_node_id, group);
    }

    for (const node of nodes) {
      if (node.type !== NodeTypes.DECISION) continue;

      const config = converterUtils.parseOrThrow(
        DecisionNodeConfigurationSchema,
        node.configuration,
      );
      const nodeOutgoingEdges = outgoingEdges.get(node.id) ?? [];

      const defaultEdgeCount = nodeOutgoingEdges.filter(
        (edge) => edge.condition_expression === null,
      ).length;
      if (defaultEdgeCount !== 1) {
        errors.push({
          code: ValidationErrorCode.DECISION_MISSING_DEFAULT_EDGE,
          message:
            defaultEdgeCount === 0
              ? "Decision node must have exactly one default outgoing edge"
              : "Decision node has more than one default outgoing edge",
          nodeId: node.client_id,
        });
      }

      const conditionalEdgeCount = nodeOutgoingEdges.filter(
        (edge) => edge.condition_expression !== null,
      ).length;
      if (conditionalEdgeCount !== config.rules.length) {
        errors.push({
          code: ValidationErrorCode.DECISION_RULES_EDGE_MISMATCH,
          message: `Decision node has ${config.rules.length} rule(s) but ${conditionalEdgeCount} conditional outgoing edge(s)`,
          nodeId: node.client_id,
        });
      }
    }

    return errors;
  },

  validateGraph: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];
    const graph = graphUtils.buildGraph(nodes, edges);

    if (graphUtils.detectCycle(nodes, graph)) {
      errors.push({
        code: ValidationErrorCode.WORKFLOW_CONTAINS_CYCLE,
        message: "Workflow contains a cycle",
      });
    }

    const startNode = nodes.find((node) => node.type === NodeTypes.START);
    if (!startNode) return errors;

    const reachable = graphUtils.reachableFrom(startNode.id, graph);
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          code: ValidationErrorCode.UNREACHABLE_NODE,
          message: "Node is unreachable from start node",
          nodeId: node.client_id,
        });
      }
    }

    for (const node of nodes) {
      const out = graph.adjacency.get(node.id) ?? [];

      if (node.type === NodeTypes.END) {
        continue;
      }

      if (node.type === NodeTypes.DECISION) {
        if (out.length === 0) {
          errors.push({
            code: ValidationErrorCode.DEAD_END_NODE,
            message: "Decision node has no outgoing edges",
            nodeId: node.client_id,
          });
        }
        continue;
      }

      if (out.length !== 1) {
        errors.push({
          code: ValidationErrorCode.INVALID_OUTGOING_EDGE_COUNT,
          message: `Node must have exactly one outgoing edge, found ${out.length}`,
          nodeId: node.client_id,
        });
      }
    }

    return errors;
  },

  validateDefinition: (nodes: NodeModel[], edges: EdgeModel[]): ValidationResult => {
    return workflowValidatorService.validate(nodes, edges);
  },
};
