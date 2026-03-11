import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { NodeTypes } from "../types/enums.js";
import type { NodeModel, EdgeModel } from "../types/models.js";
import type {
  StartNodeConfiguration,
  EndNodeConfiguration,
  UserNodeConfiguration,
  ServiceNodeConfiguration,
  ScriptNodeConfiguration,
  DecisionNodeConfiguration,
} from "../types/workflow.js";
import { graphUtils } from "../utils/graph.utils.js";

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

  DECISION_NODE_MISSING_RULES,
  DECISION_MISSING_DEFAULT_EDGE,
  DECISION_RULES_EDGE_MISMATCH,
}

/**
 * Safely deserialises a node's configuration value from the DB.
 * PostgreSQL drivers may return JSON columns as a plain object or as a raw
 * string - this handles both without duplicating the cast at every call site.
 */
function getConfiguration<T>(configuration: unknown): T {
  return (
    typeof configuration === "string"
      ? JSON.parse(configuration)
      : configuration
  ) as T;
}

export const workflowValidatorService = {
  validate: (nodes: NodeModel[], edges: EdgeModel[]): ValidationResult => {
    const errors = [
      ...workflowValidatorService.validateAllNodes(nodes),
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

  // Node validators

  validateAllNodes: (nodes: NodeModel[]): ValidationError[] => {
    const errors: ValidationError[] = [];

    const startNodes = nodes.filter((n) => n.type === NodeTypes.START);
    const endNodes = nodes.filter((n) => n.type === NodeTypes.END);

    if (startNodes.length !== 1) {
      errors.push({
        code: ValidationErrorCode.START_NODE_MISSING_OR_MULTIPLE,
        message: "Workflow must contain exactly one start node",
      });
    }

    if (endNodes.length === 0) {
      errors.push({
        code: ValidationErrorCode.END_NODE_MISSING,
        message: "Workflow must contain at least one end node",
      });
    }

    for (const node of nodes) {
      switch (node.type) {
        case NodeTypes.START:
          errors.push(...workflowValidatorService.validateStartNode(node));
          break;
        case NodeTypes.END:
          errors.push(...workflowValidatorService.validateEndNode(node));
          break;
        case NodeTypes.USER:
          errors.push(...workflowValidatorService.validateUserNode(node));
          break;
        case NodeTypes.SERVICE:
          errors.push(...workflowValidatorService.validateServiceNode(node));
          break;
        case NodeTypes.SCRIPT:
          errors.push(...workflowValidatorService.validateScriptNode(node));
          break;
        case NodeTypes.DECISION:
          errors.push(...workflowValidatorService.validateDecisionNode(node));
          break;
      }
    }

    return errors;
  },

  /**
   * Start node: validates each inputDataMap entry has a non-empty jsonPath
   * and a non-empty context variable name.
   * An empty inputDataMap is valid - the workflow accepts no inputs.
   */
  validateStartNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<StartNodeConfiguration>(node.configuration);

    config.inputDataMap.forEach((entry, index) => {
      if (!entry.jsonPath.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `Start node input ${index + 1}: jsonPath must not be empty`,
          nodeId: node.client_id,
        });
      }
      if (!entry.contextVariable.name.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `Start node input ${
            index + 1
          }: context variable name must not be empty`,
          nodeId: node.client_id,
        });
      }
    });

    return errors;
  },

  /**
   * End node: validates each resultMap entry has a non-empty context variable
   * name and a non-empty value expression.
   * An empty resultMap is valid - the node may just signal success or failure.
   */
  validateEndNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<EndNodeConfiguration>(node.configuration);

    config.resultMap.forEach((entry, index) => {
      if (!entry.contextVariable.name.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `End node result ${
            index + 1
          }: context variable name must not be empty`,
          nodeId: node.client_id,
        });
      }
      if (!entry.valueExpression.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `End node result ${
            index + 1
          }: value expression must not be empty`,
          nodeId: node.client_id,
        });
      }
    });

    return errors;
  },

  /**
   * User task: validates that every requestMap entry has a non-empty value
   * expression and every responseMap entry has a non-empty field ID.
   */
  validateUserNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<UserNodeConfiguration>(node.configuration);

    config.requestMap.forEach((entry, index) => {
      if (!entry.valueExpression.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `User task request field ${
            index + 1
          }: value expression must not be empty`,
          nodeId: node.client_id,
        });
      }
    });

    config.responseMap.forEach((entry, index) => {
      if (!entry.fieldId.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `User task response field ${
            index + 1
          }: field ID must not be empty`,
          nodeId: node.client_id,
        });
      }
    });

    return errors;
  },

  /**
   * Service task: a blank URL expression would produce a broken HTTP call at
   * runtime, so it is the critical configuration field to enforce here.
   */
  validateServiceNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<ServiceNodeConfiguration>(
      node.configuration,
    );

    if (!config.urlExpression.trim()) {
      errors.push({
        code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
        message: "Service task URL expression must not be empty",
        nodeId: node.client_id,
      });
    }

    return errors;
  },

  /**
   * Script task: both sourceCode and entryFunctionName are required for the
   * runtime to be able to execute the script.
   */
  validateScriptNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<ScriptNodeConfiguration>(
      node.configuration,
    );

    if (!config.sourceCode.trim()) {
      errors.push({
        code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
        message: "Script task source code must not be empty",
        nodeId: node.client_id,
      });
    }

    if (!config.entryFunctionName.trim()) {
      errors.push({
        code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
        message: "Script task entry function name must not be empty",
        nodeId: node.client_id,
      });
    }

    return errors;
  },

  /**
   * Decision node: must have at least one conditional rule and every rule's
   * condition expression must be non-empty.
   */
  validateDecisionNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    const config = getConfiguration<DecisionNodeConfiguration>(
      node.configuration,
    );

    if (config.rules.length === 0) {
      errors.push({
        code: ValidationErrorCode.DECISION_NODE_MISSING_RULES,
        message: "Decision node must have at least one conditional rule",
        nodeId: node.client_id,
      });
      // No point checking individual rule expressions when the array is empty.
      return errors;
    }

    config.rules.forEach((rule, index) => {
      if (!rule.conditionExpression.trim()) {
        errors.push({
          code: ValidationErrorCode.NODE_MISSING_REQUIRED_CONFIGURATION,
          message: `Decision node rule ${
            index + 1
          }: condition expression must not be empty`,
          nodeId: node.client_id,
        });
      }
    });

    return errors;
  },

  // Edge validators
  /**
   * Validates structural edge integrity: every edge has a target node, the
   * target and source nodes exist in the workflow, and illegal connections
   * (end→*, *→start, self-loop) are rejected.
   */
  validateAllEdges: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

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
        throw new DataIntegrityError(
          `Target node id=${edge.destination_node_id} does not exist`,
        );
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
        throw new DataIntegrityError(
          `Source node id=${edge.source_node_id} does not exist`,
        );
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

  /**
   * Validates decision-node edge completeness. For each decision node:
   *   - Exactly one outgoing edge must have condition_expression = null (the
   *     default branch).
   *   - The number of conditional outgoing edges (condition_expression ≠ null)
   *     must equal the number of configured rules.
   *
   * This pass runs only after validateAllEdges succeeds to guarantee that all
   * edge source/target references are valid.
   */
  validateDecisionEdges: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];

    // Build outgoing-edge index keyed by DB node id
    const outgoingEdges = new Map<string, EdgeModel[]>();
    for (const edge of edges) {
      const group = outgoingEdges.get(edge.source_node_id) ?? [];
      group.push(edge);
      outgoingEdges.set(edge.source_node_id, group);
    }

    for (const node of nodes) {
      if (node.type !== NodeTypes.DECISION) continue;

      const config = getConfiguration<DecisionNodeConfiguration>(
        node.configuration,
      );
      const nodeOutgoingEdges = outgoingEdges.get(node.id) ?? [];

      const defaultEdgeCount = nodeOutgoingEdges.filter(
        (e) => e.condition_expression === null,
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
        (e) => e.condition_expression !== null,
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

  // Graph topology validators

  /**
   * Validates graph topology: no directed cycles, all nodes reachable from the
   * start node, and no non-end node is a dead end (zero outgoing edges).
   */

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

    const startNode = nodes.find((n) => n.type === NodeTypes.START);
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
      if (node.type === NodeTypes.END) continue;

      const out = graph.adjacency.get(node.id) ?? [];

      if (out.length === 0) {
        errors.push({
          code: ValidationErrorCode.DEAD_END_NODE,
          message: "Node has no outgoing edges",
          nodeId: node.client_id,
        });
      }
    }

    return errors;
  },
};
