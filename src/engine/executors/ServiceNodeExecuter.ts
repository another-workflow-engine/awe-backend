import { BaseExecutor } from "./BaseExecutor.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { FeelDataType, NodeTypes } from "../../types/enums.js";
import type { EvaluatedContext, ExecutorResult } from "../../types/engine.js";
import { contextUtils } from "../../utils/context.utils.js";
import { httpService } from "../../services/http.service.js";
import { isValidFeelType } from "../../utils/feel.utils.js";

type ServiceFailurePayload = {
  message: string;
  responseBody?: unknown | undefined;
  responseStatus?: number | undefined;
  timedOut?: boolean | undefined;
};

export class ServiceNodeExecutor extends BaseExecutor<
  typeof NodeTypes.SERVICE
> {
  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  private mapOnErrorOutput(
    errorPayload: ServiceFailurePayload,
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
    errorPayload: ServiceFailurePayload,
    evaluatedContext: EvaluatedContext,
  ): Promise<ExecutorResult> {
    this.outputVariables.serviceStatus = "failed";
    this.outputVariables.serviceError = errorPayload;

    if (this.configuration.onError.mode === "continue") {
      const mappedResult = this.mapOnErrorOutput(errorPayload, evaluatedContext);
      if (mappedResult) {
        return mappedResult;
      }

      return await this.getCompletedResult();
    }

    return this.getFailedResult(errorPayload.message, errorPayload);
  }

  private setByJsonPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ) {
    const errorMessage = `Invalid json path=${path} in node=${this.node.id}`;

    const keys = path.replace(/^\$\./, "").split(".");
    if (keys.length === 0) {
      throw new DataIntegrityError(errorMessage);
    }

    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key) {
        throw new DataIntegrityError(errorMessage);
      }

      if (
        !(key in current) ||
        typeof current[key] !== "object" ||
        current[key] === null
      ) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    if (!lastKey) {
      throw new DataIntegrityError(errorMessage);
    }

    current[lastKey] = value;
  }

  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    let responseBody: unknown;
    let responseStatus: number | undefined;

    try {
      const url = contextUtils.getFeelEvaluatedValue(
        this.configuration.urlExpression,
        evaluatedContext,
        FeelDataType.STRING,
      );

      const headers: Record<string, string> = {};
      for (const { key, valueExpression } of this.configuration.headers ?? []) {
        headers[key] = contextUtils.getFeelEvaluatedValue(
          valueExpression,
          evaluatedContext,
          FeelDataType.STRING,
        );
      }

      const requestBody: Record<string, unknown> = {};
      for (const dataMap of this.configuration.body ?? []) {
        const value = contextUtils.getFeelEvaluatedValue(
          dataMap.valueExpression,
          evaluatedContext,
        );
        this.setByJsonPath(requestBody, dataMap.jsonPath, value);
      }

      const timeoutMs = this.configuration.timeoutMs;
      const hasTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
      const abortController = hasTimeout ? new AbortController() : undefined;
      const timeoutId = hasTimeout
        ? setTimeout(() => abortController?.abort(), timeoutMs)
        : undefined;

      try {
        const response = await httpService.request(this.configuration.method, url, {
          headers,
          ...(this.configuration.body !== undefined ? { body: requestBody } : {}),
          ...(abortController ? { signal: abortController.signal } : {}),
        });

        responseBody = response.data;
        responseStatus = response.status;
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }

      for (const dataMap of this.configuration.responseMap ?? []) {
        const value = contextUtils.getByJsonPath(responseBody, dataMap.jsonPath);
        if (value === undefined) {
          throw new DataIntegrityError(
            `"${dataMap.jsonPath}" is missing from response body`,
          );
        }

        if (!isValidFeelType(value, dataMap.type)) {
          throw new DataIntegrityError(
            `"${dataMap.jsonPath}" not of type ${dataMap.type}`,
          );
        }

        this.outputVariables[dataMap.contextVariableName] = value;
      }

      this.outputVariables.serviceStatus = "succeeded";

      return await this.getCompletedResult();
    } catch (error) {
      const timeoutMs = this.configuration.timeoutMs;
      if (
        timeoutMs !== undefined &&
        this.isAbortError(error)
      ) {
        return await this.handleFailure(
          {
            message: `Service task timed out after ${timeoutMs}ms`,
            responseBody,
            responseStatus,
            timedOut: true,
          },
          evaluatedContext,
        );
      }

      const message = error instanceof Error ? error.message : "Service task failed";

      return await this.handleFailure(
        {
          message,
          responseBody,
          responseStatus,
        },
        evaluatedContext,
      );
    }
  }
}
