import { BaseExecutor } from "./BaseExecutor.js";
import { contextUtils } from "../../utils/context.utils.js";
import { NodeTypes, TaskStatuses } from "../../types/enums.js";
import type {
  ExecutorResult,
  EvaluatedContext,
  ScriptExecutionService,
} from "../../types/engine.js";
import { JDoodleService } from "../services/jdoodle.service.js";
import { GeminiService } from "../services/gemini.service.js";
import { EngineError } from "../../errors/EngineError.js";
import { isValidFeelType } from "../../utils/feel.utils.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";

type ScriptFailurePayload = {
  message: string;
  output?: unknown | undefined;
  timedOut?: boolean | undefined;
};

const executionServiceRegistry: Record<string, ScriptExecutionService> = {
  gemini: new GeminiService(),
  jdoodle: new JDoodleService(),
};

export class ScriptNodeExecutor extends BaseExecutor<typeof NodeTypes.SCRIPT> {
  private mapOnErrorOutput(
    errorPayload: ScriptFailurePayload,
    evaluatedContext: EvaluatedContext,
  ): ExecutorResult | null {
    const mappingContext: EvaluatedContext = {
      ...evaluatedContext,
      context: {
        ...evaluatedContext.context,
        error: errorPayload,
      },
    };

    for (const map of this.configuration.onError.outputMap ?? []) {
      if (map.fromType === "jsonPath") {
        const value = contextUtils.getByJsonPath(errorPayload, map.jsonPath);
        if (value === undefined) {
          return this.getFailedResult(
            `"${map.jsonPath}" is missing from onError payload`,
          );
        }

        if (!isValidFeelType(value, map.dataType)) {
          return this.getFailedResult(
            `"${map.jsonPath}" not of type ${map.dataType}`,
          );
        }

        this.outputVariables[map.contextVariableName] = value;
        continue;
      }

      this.outputVariables[map.contextVariableName] =
        contextUtils.getFeelEvaluatedValue(map.valueExpression, mappingContext);
    }

    return null;
  }

  private async handleFailure(
    errorPayload: ScriptFailurePayload,
    evaluatedContext: EvaluatedContext,
  ): Promise<ExecutorResult> {
    this.outputVariables.scriptStatus = "failed";
    this.outputVariables.scriptError = errorPayload;

    if (this.configuration.onError.mode === "continue") {
      const mappedResult = this.mapOnErrorOutput(errorPayload, evaluatedContext);
      if (mappedResult) {
        return mappedResult;
      }

      return await this.getCompletedResult();
    }

    return this.getFailedResult(errorPayload.message, errorPayload);
  }

  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    try {
      const parameters = (this.configuration.parameterMap ?? []).map((dataMap) =>
        contextUtils.getFeelEvaluatedValue(
          dataMap.valueExpression,
          evaluatedContext,
        ),
      );

      const executionServiceType = this.configuration.executionService;

      const service = executionServiceRegistry[executionServiceType];
      if (service === undefined) {
        throw new EngineError(
          `Script service for ${executionServiceType} not found`,
        );
      }

      const timeoutMs = this.configuration.timeoutMs;
      let resultPromise = service.executeScript(
        this.configuration.sourceCode,
        this.configuration.entryFunctionName,
        parameters,
      );

      if (typeof timeoutMs === "number" && timeoutMs > 0) {
        let timeoutId: NodeJS.Timeout | undefined;

        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Script task timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          });

          resultPromise = Promise.race([resultPromise, timeoutPromise]);
          const result = await resultPromise;

          if (!result.success) {
            return await this.handleFailure(
              {
                message: "Script failed to execute",
                output: result.output,
              },
              evaluatedContext,
            );
          }

          for (const dataMap of this.configuration.responseMap ?? []) {
            const value = contextUtils.getByJsonPath(result.output, dataMap.jsonPath);

            if (value === undefined) {
              throw new DataIntegrityError(
                `"${dataMap.jsonPath}" is missing from result`,
              );
            }

            if (!isValidFeelType(value, dataMap.type)) {
              throw new DataIntegrityError(
                `"${dataMap.jsonPath}" not of type ${dataMap.type}`,
              );
            }

            this.outputVariables[dataMap.contextVariableName] = value;
          }

          this.outputVariables.scriptStatus = "succeeded";

          return await this.getCompletedResult();
        } finally {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
        }
      }

      const result = await resultPromise;
      if (!result.success) {
        return await this.handleFailure(
          {
            message: "Script failed to execute",
            output: result.output,
          },
          evaluatedContext,
        );
      }

      for (const dataMap of this.configuration.responseMap ?? []) {
        const value = contextUtils.getByJsonPath(result.output, dataMap.jsonPath);

        if (value === undefined) {
          throw new DataIntegrityError(
            `"${dataMap.jsonPath}" is missing from result`,
          );
        }

        if (!isValidFeelType(value, dataMap.type)) {
          throw new DataIntegrityError(
            `"${dataMap.jsonPath}" not of type ${dataMap.type}`,
          );
        }

        this.outputVariables[dataMap.contextVariableName] = value;
      }

      this.outputVariables.scriptStatus = "succeeded";

      return await this.getCompletedResult();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Script task failed";
      const timeoutMs = this.configuration.timeoutMs;

      if (
        typeof timeoutMs === "number" &&
        timeoutMs > 0 &&
        message === `Script task timed out after ${timeoutMs}ms`
      ) {
        return await this.handleFailure(
          {
            message,
            timedOut: true,
          },
          evaluatedContext,
        );
      }

      return await this.handleFailure(
        {
          message,
        },
        evaluatedContext,
      );
    }
  }
}
