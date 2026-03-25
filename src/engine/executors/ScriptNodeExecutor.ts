import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ScriptNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { contextUtils } from "../../utils/context.utils.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";
import { GeminiService } from "../../services/gemini.service.js";

export class ScriptNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    console.log(" Executing Script Node...");

    const parsed = ScriptNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Script node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const evaluatedContext =
      await contextUtils.buildFeelContext(inputVariables);

    const parameters = configuration.parameterMap.map(
      (parameter) =>
        evaluate(parameter.valueExpression, evaluatedContext).value,
    );

    console.log(" Parameters:", parameters);

    let parsedOutput;

    try {
      const response = await GeminiService.executeScript(
        configuration.sourceCode,
        configuration.entryFunctionName,
        parameters,
      );
      parsedOutput = response;
    } catch (error: any) {
      console.error(" Gemini Error:", error.message);

      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: error.message,
        nextNodeId: null,
      };
    }

    if (!parsedOutput || parsedOutput?.error) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: parsedOutput?.error || "No response from Gemini",
        nextNodeId: null,
      };
    }

    function getValueByPath(obj: any, path: string) {
      return path.split(".").reduce((acc, key) => acc?.[key], obj);
    }

    let outputVariables: Record<string, unknown> = {};

    configuration.responseMap.forEach(({ jsonPath, contextVariableName }) => {
      outputVariables[contextVariableName] =
        typeof parsedOutput === "object"
          ? getValueByPath(parsedOutput, jsonPath)
          : parsedOutput;
    });

    console.log(" Output Variables:", outputVariables);

    const [nextNode] = await edgeService.getDestinationNodeIdsBySourceNodeId(
      node.id,
    );

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables,
      nextNodeId: nextNode ?? null,
    };
  }
}
