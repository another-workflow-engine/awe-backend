import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ScriptNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { fetchService } from "../../services/fetch.service.js";
import { buildFeelContext } from "../../utils/contextResolver.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";

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

    const responseBody = await fetchService.post(
      "http://localhost:3003/execute",
      {
        sourceCode: configuration.sourceCode,
        entryFunction: configuration.entryFunctionName,
        parameters: parameters,
      },
    );

    if (responseBody?.error || !responseBody?.output) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: responseBody?.error,
        nextNodeId: null,
      };
    }

    let outputVariables: Record<string, unknown> = {};
    configuration.responseMap.forEach(
      ({ jsonPath, type, contextVariable, validationExpression }) => {
        if (!contextVariable) {
          return;
        }
        outputVariables[contextVariable.name] = responseBody.output[jsonPath];
      },
    );

    const [nextNode] = await edgeService.getNextNodeIdsBySourceNodeId(node.id);

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: outputVariables,
      nextNodeId: nextNode ?? null,
    };
  }
}
