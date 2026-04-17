import type {
  DecisionNodeConfiguration,
  EndNodeConfiguration,
  Fetchable,
  Node,
  NodeConfiguration,
  NodeInputSchema,
  NodeOuputSchema,
  ScriptNodeConfiguration,
  EmailNodeConfiguration,
  ServiceNodeConfiguration,
  StartNodeConfiguration,
  StartNodeDataMap,
  UserNodeConfiguration,
} from "../types/workflow.js";
import { NodeSchema } from "../schemas/node.schema.js";
import type { NodeModel } from "../types/models.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { NodeType } from "../types/database.js";
import { EngineError } from "../errors/EngineError.js";

function extractVariableNames(
  expression: string,
  contextSet: Set<string>,
  secretSet: Set<string>,
): void {
  for (const result of expression.matchAll(/(?<=context\.)\w+/g)) {
    contextSet.add(result[0]);
  }

  for (const result of expression.matchAll(/(?<=secret\.)\w+/g)) {
    secretSet.add(result[0]);
  }
}

type SchemaResult = {
  inputSchema: NodeInputSchema;
  outputSchema: NodeOuputSchema;
};

function buildSchema(params: {
  expressions?: string[];
  outputVariables?: string[];
  includeSecrets?: boolean;
}): SchemaResult {
  const inputVars = new Set<string>();
  const inputSecrets = new Set<string>();
  const outputVars = new Set(params.outputVariables ?? []);

  for (const expr of params.expressions ?? []) {
    extractVariableNames(expr, inputVars, inputSecrets);
  }

  return {
    inputSchema: {
      variableNames: [...inputVars],
      secretNames: params.includeSecrets === true ? [...inputSecrets] : [],
    },
    outputSchema: {
      variableNames: [...outputVars],
    },
  };
}

function getStartSchema(config: StartNodeConfiguration): SchemaResult {
  return {
    inputSchema: {
      variableNames: config.inputDataMap
        .filter((i) => i.fetchableId === undefined)
        .map((i) => i.contextVariableName),
      secretNames: [],
    },
    outputSchema: {
      variableNames: config.inputDataMap.map((i) => i.contextVariableName),
    },
  };
}

function getUserSchema(config: UserNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: [
      ...config.requestMap.map((r) => r.valueExpression),
      ...(config.assignee ? [config.assignee] : []),
    ],
    outputVariables: config.responseMap.map((r) => r.contextVariableName),
  });
}

function getServiceSchema(config: ServiceNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: [
      config.urlExpression,
      ...(config.body?.map((b) => b.valueExpression) ?? []),

      ...(config.headers?.map((h) => h.valueExpression) ?? []),
    ],
    outputVariables: config.responseMap.map((r) => r.contextVariableName),
    includeSecrets: true,
  });
}

function getScriptSchema(config: ScriptNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: config.parameterMap.map((p) => p.valueExpression),
    outputVariables: config.responseMap.map((r) => r.contextVariableName),
    includeSecrets: true,
  });
}

function getEmailSchema(config: EmailNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: [
      config.senderExpression,
      config.authUserExpression,
      config.authPassExpression,
      config.subjectExpression,
      config.bodyExpression,
      ...config.to.map((recipient) => recipient.valueExpression),
      ...(config.cc ?? []).map((recipient) => recipient.valueExpression),
      ...(config.bcc ?? []).map((recipient) => recipient.valueExpression),
    ],
    outputVariables: (config.responseMap ?? []).map(
      (r) => r.contextVariableName,
    ),
    includeSecrets: true,
  });
}

function getDecisionSchema(config: DecisionNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: config.rules.map((r) => r.conditionExpression),
  });
}

function getEndSchema(config: EndNodeConfiguration): SchemaResult {
  return buildSchema({
    expressions: config.resultMap.map((r) => r.valueExpression),
  });
}

type SchemaGetters = {
  [K in NodeType]: (config: NodeConfiguration<K>) => SchemaResult;
};

const schemaGetters: SchemaGetters = {
  start: getStartSchema,
  service: getServiceSchema,
  email: getEmailSchema,
  script: getScriptSchema,
  user: getUserSchema,
  decision: getDecisionSchema,
  end: getEndSchema,
};

export const nodeSchemaService = {
  getNodeSchema: (node: NodeModel): Node => {
    const nodeObject = {
      id: node.client_id,
      label: node.name,
      description: node.description,
      position:
        node.x_coordinate && node.y_coordinate
          ? { x: node.x_coordinate, y: node.y_coordinate }
          : null,
      type: node.type,
      configuration: node.configuration,
    };

    return converterUtils.parseOrThrow(NodeSchema, nodeObject);
  },

  getFetchablesMap: (
    inputDataMap: StartNodeDataMap[],
    fetchables: Fetchable[],
  ): Record<string, NodeInputSchema> => {
    const schemas: Record<string, NodeInputSchema> = {};

    for (const fetchable of fetchables) {
      schemas[fetchable.id] = buildSchema({
        expressions: [
          fetchable.urlExpression,
          ...(fetchable.headers?.map((b) => b.valueExpression) ?? []),
        ],
        includeSecrets: true,
      }).inputSchema;
    }

    let fetchablesMap: Record<string, NodeInputSchema> = {};

    for (const dataMap of inputDataMap ?? []) {
      if (!dataMap.fetchableId) {
        continue;
      }

      const schema = schemas[dataMap.fetchableId];
      if (!schema) {
        throw new EngineError("Fetchable input schema could not be evaluated");
      }

      fetchablesMap[dataMap.contextVariableName] = schema;
    }

    return fetchablesMap;
  },

  getInputOutputSchemas: (
    node: Node,
    fetchablesMap: Record<string, NodeInputSchema>,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const schemaBuilder = schemaGetters[node.type] as (
      config: NodeConfiguration<typeof node.type>,
    ) => SchemaResult;

    const schemas = schemaBuilder(node.configuration);

    const inputSchemas = schemas.inputSchema.variableNames.flatMap(
      (variableName) => {
        const schema = fetchablesMap[variableName];
        return schema ? [schema] : [];
      },
    );

    inputSchemas.push(schemas.inputSchema);

    schemas.inputSchema = {
      variableNames: [...new Set(inputSchemas.flatMap((s) => s.variableNames))],
      secretNames: [...new Set(inputSchemas.flatMap((s) => s.secretNames))],
    };

    return schemas;
  },
};
