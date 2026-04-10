import type { InputVariables, Context } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";
import type { NodeInputSchema } from "../types/workflow.js";
import { EngineError } from "../errors/EngineError.js";
import { JSONPath } from "jsonpath-plus";
import { FeelDataType } from "../types/enums.js";
import { isValidFeelType, type FeelDataTypeMap } from "./feel.utils.js";
import { httpService } from "../services/http.service.js";

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

  async evaluateContext(contextVariables: InputVariables): Promise<Context> {
    const { constants, fetchables, urls } = contextVariables;

    const returnContext: Record<string, unknown> = { ...constants };

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
          {
            context: returnContext,
          },
          FeelDataType.STRING,
        );

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(urlSettings.headers)) {
          headers[key] = contextUtils.getFeelEvaluatedValue(
            value,
            {
              context: returnContext,
            },
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

      returnContext[varName] = varValue;
    }

    return { context: returnContext };
  },

  getFeelEvaluatedValue<T extends FeelDataType>(
    expression: string,
    context: Context,
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

  getTaskContext(
    instanceContext: InputVariables,
    inputSchema: NodeInputSchema, 
  ): InputVariables {
    const { constants, fetchables, urls } = instanceContext;
    const taskContext: InputVariables = {
      constants: {},
      fetchables: {},
      urls: {},
    };

    inputSchema.variableNames.forEach((variableName) => {
      if (variableName in constants) {
        taskContext.constants[variableName] = constants[variableName];
        return;
      }

      const fetchable = fetchables[variableName];

      if (fetchable === undefined) {
        throw new EngineError(
          `Required variable ${variableName} does not exists in context`,
        );
      }

      taskContext.fetchables[variableName] = fetchable;

      const urlSettings = urls[fetchable.urlId];
      if (!urlSettings) {
        throw new DataIntegrityError(
          `Context does not have referenced url of id=${fetchable.urlId} `,
        );
      }

      taskContext.urls[fetchable.urlId] = urlSettings;
    });

    return taskContext;
  },
};
