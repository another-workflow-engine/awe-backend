import type { Context, EvaluatedContext } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";
import { EngineError } from "../errors/EngineError.js";
import { JSONPath } from "jsonpath-plus";
import { FeelDataType } from "../types/enums.js";
import { isValidFeelType, type FeelDataTypeMap } from "./feel.utils.js";
import { httpService } from "../services/http.service.js";
import { secretService } from "../services/secrets/secret.service.js";

export const contextUtils = {
  getByJsonPath(data: any, path: string): unknown {
    try {
      const result = JSONPath({
        path,
        json: data,
        wrap: false,
      });

      return result;
    } catch {
      return undefined;
    }
  },

  async evaluateContext(contextVariables: Context): Promise<EvaluatedContext> {
    const { constants, fetchables, urls, secrets } = contextVariables;

    const evaluatedContext: EvaluatedContext = {
      context: { ...constants },
      secret: {},
    };

    const fetchedSecrets = await secretService.getByIds(Object.values(secrets));

    for (const [variableName, secretId] of Object.entries(secrets)) {
      const value = fetchedSecrets[secretId];
      if (!value) {
        throw new EngineError(`Secret ${variableName} could not evalauted`);
      }

      evaluatedContext.secret[variableName] = value;
    }

    const fetchedResponses: Record<string, unknown> = {};

    for (const [varName, { urlId, jsonPath, dataType }] of Object.entries(
      fetchables,
    )) {
      const urlSettings = urls[urlId];
      if (!urlSettings) {
        throw new DataIntegrityError(
          `Context does not have referenced url of id=${urlId} `,
        );
      }

      if (!(urlId in fetchedResponses)) {
        const url = contextUtils.getFeelEvaluatedValue(
          urlSettings.urlExpression,
          evaluatedContext,
          FeelDataType.STRING,
        );

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(urlSettings.headers)) {
          headers[key] = contextUtils.getFeelEvaluatedValue(
            value,
            evaluatedContext,
            FeelDataType.STRING,
          );
        }

        const response = await httpService.get(url, {
          headers: urlSettings.headers,
        });
        fetchedResponses[urlId] = response.data;
      }

      const varValue = contextUtils.getByJsonPath(
        fetchedResponses[urlId],
        jsonPath,
      );
      if (!isValidFeelType(varValue, dataType)) {
        throw new EngineError(
          `Fetchable ${varName} must be of type ${dataType}. Received type = ${typeof varValue}`,
        );
      }

      evaluatedContext.context[varName] = varValue;
    }

    return evaluatedContext;
  },

  getFeelEvaluatedValue<T extends FeelDataType>(
    expression: string,
    context: EvaluatedContext,
    dataType?: T,
  ): FeelDataTypeMap[T] {
    const result = evaluate(expression, context);

    if (!result || result.warnings.length > 0) {
      throw new DataIntegrityError(`Invalid FEEL expression ${expression}`);
    }

    if (dataType && !isValidFeelType(result.value, dataType)) {
      throw new DataIntegrityError(
        `Invalid FEEL expression ${expression}, expected ${dataType}, got ${typeof result.value}`,
      );
    }

    return result.value as FeelDataTypeMap[T];
  },
};
