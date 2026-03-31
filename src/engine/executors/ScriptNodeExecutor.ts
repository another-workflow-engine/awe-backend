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
import { getLogger } from "../../logger.js";

function getValueByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
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
    let rawOutput: string = "";

    try {
      const executionService = configuration.executionService ?? "jdoodle";
      const logger = getLogger();

      logger.info(
        { nodeId: node.id, executionService },
        `Executing script using ${executionService} service`,
      );
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

      if (executionService === "gemini") {
        // Use GeminiService
        parsedOutput = await GeminiService.executeScript(
          configuration.sourceCode,
          configuration.entryFunctionName,
          parameters,
        );
        rawOutput = JSON.stringify(parsedOutput);
      } else {
        // Default to JDoodleService
        const response = await JDoodleService.executeScript(
          configuration.sourceCode,
          configuration.entryFunctionName,
          parameters,
        );
        parsedOutput = response.parsedOutput;
        rawOutput = response.rawOutput;
      }

      console.log("RAW:", rawOutput);
      console.log("PARSED:", parsedOutput);
    } catch (error: any) {
      const logger = getLogger();
      logger.error(
        {
          nodeId: node.id,
          error: error.message,
          stack: error.stack,
          executionService: configuration.executionService ?? "jdoodle",
        },
        "Script execution failed",
      );
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
          ? getValueByPath(parsedOutput, jsonPath)
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
