import { fetchService } from "../services/fetch.service.js";
import type { ContextVariables } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";
import type { NodeInputSchema } from "../types/workflow.js";
import { EngineError } from "../errors/EngineError.js";

type DataTypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  object: Record<string, unknown>;
  array: unknown[];
  unknowm: unknown;
};

function isValidType(value: unknown, type: keyof DataTypeMap): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    default:
      return typeof value === type;
  }
}

export const contextUtils = {
  getByPath(data: unknown, path: string): unknown {
    const parts = path.split(".").filter(Boolean);

    return parts.reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined) {
        return undefined;
      }
      return (acc as Record<string, unknown>)[key];
    }, data);
  },

  async buildFeelContext(
    contextVariables: ContextVariables,
  ): Promise<{ context: Record<string, unknown> }> {
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
        const result = evaluate(urlSettings.urlExpression, {
          context: returnContext,
        });

        if (result.warnings.length !== 0 || typeof result.value !== "string") {
          throw new DataIntegrityError(
            `Invalid FEEL expression "${urlSettings.urlExpression}"`,
          );
        }

        const headers: Record<string, string> = {};

        for (const [key, value] of Object.entries(urlSettings.headers)) {
          const result = evaluate(value, {
            context: returnContext,
          });
          if (
            result.warnings.length !== 0 ||
            typeof result.value !== "string"
          ) {
            throw new DataIntegrityError(`Invalid FEEL expression "${value}"`);
          }

          headers[key] = result.value;
        }

        fetchedResponses[urlId] = await fetchService.get(
          result.value,
          urlSettings.headers,
        );
      }

      const rawValue = contextUtils.getByPath(
        fetchedResponses[urlId],
        jsonPath,
      );
      returnContext[varName] = rawValue;
    }

    return { context: returnContext };
  },

  getEvaluatedValue<T extends keyof DataTypeMap>(
    expression: string,
    context: Record<string, unknown>,
    dataType: T,
  ): DataTypeMap[T] {
    const result = evaluate(expression, context);

    if (!result || result.warnings) {
      throw new DataIntegrityError(`Invalid FEEL expression ${expression}`);
    }

    if (!isValidType(result.value, dataType)) {
      throw new DataIntegrityError(
        `Invalid FEEL expression ${expression}, expected ${dataType}, got ${typeof result.value}`,
      );
    }

    return result.value as DataTypeMap[T];
  },

  getTaskExecutionContext(
    contextVariables: ContextVariables,
    inputSchema: NodeInputSchema,
  ): ContextVariables {
    const { constants, fetchables, urls } = contextVariables;
    const returnContext: ContextVariables = {
      constants: {},
      fetchables: {},
      urls: {},
    };

    for (const variableName of inputSchema.variableNames) {
      if (variableName in constants) {
        returnContext.constants[variableName] = constants[variableName];
        continue;
      }

      const fetchable = fetchables[variableName];

      if (fetchable === undefined) {
        throw new EngineError(
          `Required variable ${variableName} does not exists in context`,
        );
      }

      returnContext.fetchables[variableName] = fetchable;

      const urlSettings = urls[fetchable.urlId];
      if (!urlSettings) {
        throw new DataIntegrityError(
          `Context does not have referenced url of id=${fetchable.urlId} `,
        );
      }

      returnContext.urls[fetchable.urlId] = urlSettings;
    }

    return returnContext;
  },
};
