import { Executor } from "./Executor.js";
import { contextUtils } from "../../utils/context.utils.js";
import { FeelDataType, NodeTypes } from "../../types/enums.js";
import type {
  ExecutorResult,
  EvaluatedContext,
  ScriptExecutionService,
} from "../../types/engine.js";
import { JDoodleService } from "../services/jdoodle.service.js";
import { GeminiService } from "../services/gemini.service.js";
import { EngineError } from "../../errors/EngineError.js";
import { isValidFeelType } from "../../utils/feel.utils.js";

const executionServiceRegistry: Record<string, ScriptExecutionService> = {
  gemini: new GeminiService(),
  jdoodle: new JDoodleService(),
};

export class ScriptNodeExecutor extends Executor<typeof NodeTypes.SCRIPT> {
  async execute(
    evaluatedContext: EvaluatedContext,
    signal?: AbortSignal,
  ): Promise<ExecutorResult> {
    const parameters = (this.configuration.parameterMap ?? []).map((dataMap) =>
      contextUtils.getFeelEvaluatedValue(
        dataMap.valueExpression,
        evaluatedContext,
      ),
    );

    const executionServiceType = this.configuration.serviceType;

    const service = executionServiceRegistry[executionServiceType];
    if (service === undefined) {
      throw new EngineError(
        `Script service for ${executionServiceType} not found`,
      );
    }

    const credentials: Record<string, string> = {};
    if (this.configuration.credentials) {
      for (const [key, valueExpression] of Object.entries(
        this.configuration.credentials,
      )) {
        if (typeof valueExpression === "string" && valueExpression.trim()) {
          const value = contextUtils.getFeelEvaluatedValue(
            valueExpression,
            evaluatedContext,
            FeelDataType.STRING,
          );
          credentials[key] = value;
        }
      }
    }

    const result = await service.executeScript(
      credentials,
      this.configuration.sourceCode,
      this.configuration.entryFunctionName,
      parameters,
      signal,
    );

    if (!result.success) {
      return this.getFailedResult(`Script failed to execute`, result.output);
    }

    for (const dataMap of this.configuration.responseMap ?? []) {
      const value = contextUtils.getByJsonPath(result.output, dataMap.jsonPath);

      if (value === undefined) {
        return this.getFailedResult(
          `"${dataMap.jsonPath}" is missing from result`,
        );
      }

      if (!isValidFeelType(value, dataMap.type)) {
        return this.getFailedResult(
          `"${dataMap.jsonPath}" not of type ${dataMap.type}`,
        );
      }

      this.outputVariables[dataMap.contextVariableName] = value;
    }

    return await this.getCompletedResult();
  }
}
