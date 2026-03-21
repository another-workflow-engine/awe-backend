import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ScriptNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { httpRequestService } from "../../services/httpRequest.service.js";
import { buildFeelContext } from "../../utils/contextResolver.js";
import { TaskStatuses } from "../../types/enums.js";
import type {
  ContextVariables,
  ExecutorResult,
  ScriptExecutionResponse,
} from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);

  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, data);
}

export class ScriptNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = ScriptNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Script node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const currentContext = await buildFeelContext(inputVariables);
    const parameters = configuration.parameterMap.map(
      (parameter) => evaluate(parameter.valueExpression, currentContext).value,
    );

    const response = await httpRequestService.post(
      "http://localhost:3003/execute",
      {
        sourceCode: configuration.sourceCode,
        entryFunction: configuration.entryFunctionName,
        parameters: parameters,
      },
    );

    if (!response || typeof response !== "object") {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: "Invalid response from script execution service",
        nextNodeId: null,
      };
    }

    const responseBody = response as ScriptExecutionResponse;

    if (responseBody.error || !responseBody.output) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: responseBody.error || "Script execution failed without output",
        nextNodeId: null,
      };
    }

    let outputVariables: Record<string, unknown> = {};
    configuration.responseMap.forEach(
      ({ jsonPath, type, contextVariable, validationExpression }) => {
        if (!contextVariable) {
          return;
        }
        const value = getByPath(responseBody.output, jsonPath);
        outputVariables[contextVariable.name] = value;
      },
    );

    const [nextNode] = await edgeService.getNextNodeIdsBySourceNodeId(
      node.id,
      transaction,
    );

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: outputVariables,
      nextNodeId: nextNode ?? null,
    };
  }
}
