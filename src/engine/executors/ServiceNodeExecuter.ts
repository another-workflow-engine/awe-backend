import { BaseExecutor } from "./BaseExecutor.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { FeelDataType, NodeTypes } from "../../types/enums.js";
import type { EvaluatedContext, ExecutorResult } from "../../types/engine.js";
import { contextUtils } from "../../utils/context.utils.js";
import { httpService } from "../../services/http.service.js";
import { isValidFeelType } from "../../utils/feel.utils.js";

export class ServiceNodeExecutor extends BaseExecutor<
  typeof NodeTypes.SERVICE
> {
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

    let requestBody: Record<string, unknown> = {};
    this.configuration.body?.forEach((dataMap) => {
      const value = contextUtils.getFeelEvaluatedValue(
        dataMap.valueExpression,
        evaluatedContext,
      );
      this.setByJsonPath(requestBody, dataMap.jsonPath, value);
    });

    const response = await httpService.request(this.configuration.method, url, {
      headers,
      ...(this.configuration.body !== undefined ? { body: requestBody } : {}),
    });

    for (const dataMap of this.configuration.responseMap) {
      const value = contextUtils.getByJsonPath(response.data, dataMap.jsonPath);
      if (value === undefined) {
        return this.getFailedResult(
          `"${dataMap.jsonPath}" is missing from response body`,
          { responseBody: response.data, responseStatus: response.status },
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
