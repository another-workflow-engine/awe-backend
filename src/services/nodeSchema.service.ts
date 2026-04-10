import type {
  DecisionNodeConfiguration,
  EndNodeConfiguration,
  Node,
  NodeInputSchema,
  NodeOuputSchema,
  ScriptNodeConfiguration,
  ServiceNodeConfiguration,
  StartNodeConfiguration,
  UserNodeConfiguration,
} from "../types/workflow.js";
import { NodeTypes } from "../types/enums.js";
import { NodeSchema } from "../schemas/node.schema.js";
import type { NodeModel } from "../types/models.js";
import { converterUtils } from "../utils/converter.utils.js";

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

  getInputOutputSchemas: (
    node: Node,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    switch (node.type) {
      case NodeTypes.START:
        return nodeSchemaService._getInputOuputSchemasForStartNode(
          node.configuration,
        );

      case NodeTypes.USER:
        return nodeSchemaService._getInputOuputSchemasForUserNode(
          node.configuration,
        );

      case NodeTypes.SERVICE:
        return nodeSchemaService._getInputOutputSchemasForServiceNode(
          node.configuration,
        );

      case NodeTypes.SCRIPT:
        return nodeSchemaService._getInputOuputSchemasForScriptNode(
          node.configuration,
        );

      case NodeTypes.DECISION:
        return nodeSchemaService._getInputOutputSchemasForDecisionNode(
          node.configuration,
        );

      case NodeTypes.END:
        return nodeSchemaService._getInputOutputSchemasForEndNode(
          node.configuration,
        );

      default:
        throw new Error(
          `Input schema evaluation not implemented for node = ${node}`,
        );
    }
  },

  _updateNameSetForExpression: (
    nameSet: Set<string>,
    secretSet: Set<string>,
    expression: string,
  ): void => {
    const variableIterator = expression.matchAll(/(?<=context\.)\w*/g);
    for (const result of variableIterator) {
      nameSet.add(result[0]);
    }

    const secretIterator = expression.matchAll(/(?<=secret\.)\w*/g);
    for (const result of secretIterator) {
      secretSet.add(result[0]);
    }
  },

  _getInputOuputSchemasForStartNode: (
    configuration: StartNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();
    const inputSecretSet = new Set<string>();
    const outputVariableSet = new Set<string>();

    configuration.inputDataMap.forEach((input) => {
      const variableName = input.contextVariableName;

      if (input.fetchableId === undefined) {
        inputVariableSet.add(variableName);
      }

      outputVariableSet.add(variableName);
    });

    configuration.secretDataMap.forEach((secret) => {
      inputSecretSet.add(secret.secretContextName);
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [...inputSecretSet],
      },
      outputSchema: {
        variableNames: [...outputVariableSet],
      },
    };
  },

  _getInputOuputSchemasForUserNode: (
    configuration: UserNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();
    const inputSecretSet = new Set<string>();
    const outputVariableSet = new Set<string>();

    configuration.requestMap.forEach((data) => {
      nodeSchemaService._updateNameSetForExpression(
        inputVariableSet,
        inputSecretSet,
        data.valueExpression,
      );
    });

    if (configuration.assignee) {
      nodeSchemaService._updateNameSetForExpression(
        inputVariableSet,
        new Set<string>(),
        configuration.assignee,
      );
    }

    configuration.responseMap.forEach((data) => {
      outputVariableSet.add(data.contextVariableName);
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [...inputSecretSet],
      },
      outputSchema: {
        variableNames: [...outputVariableSet],
      },
    };
  },

  _getInputOutputSchemasForServiceNode: (
    configuration: ServiceNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();
    const inputSecretSet = new Set<string>();
    const outputVariableSet = new Set<string>();

    if (configuration.body) {
      configuration.body.forEach((data) =>
        nodeSchemaService._updateNameSetForExpression(
          inputVariableSet,
          inputSecretSet,
          data.valueExpression,
        ),
      );
    }

    nodeSchemaService._updateNameSetForExpression(
      inputVariableSet,
      inputSecretSet,
      configuration.urlExpression,
    );

    configuration.responseMap.forEach((data) => {
      outputVariableSet.add(data.contextVariableName);
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [...inputSecretSet],
      },
      outputSchema: {
        variableNames: [...outputVariableSet],
      },
    };
  },

  _getInputOuputSchemasForScriptNode: (
    configuration: ScriptNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();
    const inputSecretSet = new Set<string>();
    const outputVariableSet = new Set<string>();

    configuration.parameterMap.forEach((data) => {
      nodeSchemaService._updateNameSetForExpression(
        inputVariableSet,
        inputSecretSet,
        data.valueExpression,
      );
    });

    configuration.responseMap.forEach((data) => {
      outputVariableSet.add(data.contextVariableName);
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [...inputSecretSet],
      },
      outputSchema: {
        variableNames: [...outputVariableSet],
      },
    };
  },

  _getInputOutputSchemasForDecisionNode: (
    configuration: DecisionNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();
    const inputSecretSet = new Set<string>();

    configuration.rules.forEach((data) => {
      nodeSchemaService._updateNameSetForExpression(
        inputVariableSet,
        inputSecretSet,
        data.conditionExpression,
      );
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [...inputSecretSet],
      },
      outputSchema: {
        variableNames: [],
      },
    };
  },

  _getInputOutputSchemasForEndNode: (
    configuration: EndNodeConfiguration,
  ): {
    inputSchema: NodeInputSchema;
    outputSchema: NodeOuputSchema;
  } => {
    const inputVariableSet = new Set<string>();

    configuration.resultMap.forEach((data) => {
      nodeSchemaService._updateNameSetForExpression(
        inputVariableSet,
        new Set<string>(),
        data.valueExpression,
      );
    });

    return {
      inputSchema: {
        variableNames: [...inputVariableSet],
        secretNames: [],
      },
      outputSchema: {
        variableNames: [],
      },
    };
  },
};
