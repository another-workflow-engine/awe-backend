import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ScriptNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { contextUtils } from "../../utils/context.utils.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";
import { JDoodleService } from "../../services/jdoodle.service.js";
import { GeminiService } from "../../services/gemini.service.js";

export class ScriptNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
  ): Promise<ExecutorResult> {
    const parsed = ScriptNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Script node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const evaluatedContext = await contextUtils.evaluateContext(inputVariables);

    const parameters = configuration.parameterMap.map(
      (parameter) =>
        evaluate(parameter.valueExpression, evaluatedContext).value,
    );

    let parsedOutput;

    try {
      const executionService = configuration.executionService;
      let response;

      switch (executionService) {
        case "gemini":
          response = await GeminiService.executeScript(
            configuration.sourceCode,
            configuration.entryFunctionName,
            parameters,
          );
          break;
        case "jdoodle":
        default:
          response = await JDoodleService.executeScript(
            configuration.sourceCode,
            configuration.entryFunctionName,
            parameters,
          );
          break;
      }

      parsedOutput = response.parsedOutput;

      console.log("RAW:", response.rawOutput);
      console.log("PARSED:", parsedOutput);
    } catch (error: any) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        errorMessage: error.message,
        nextNodeId: null,
      };
    }

    if (!parsedOutput) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        errorMessage: "Script execution returned empty output",
        nextNodeId: null,
      };
    }

    if (parsedOutput?.error) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        errorMessage: parsedOutput.error,
        nextNodeId: null,
      };
    }

    let outputVariables: Record<string, unknown> = {};

    configuration.responseMap.forEach(({ jsonPath, contextVariableName }) => {
      outputVariables[contextVariableName] =
        typeof parsedOutput === "object"
          ? contextUtils.getByJsonPath(parsedOutput, jsonPath)
          : parsedOutput;
    });

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
