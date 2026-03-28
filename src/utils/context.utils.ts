import type { ContextVariables } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";
import type { NodeInputSchema } from "../types/workflow.js";
import { EngineError } from "../errors/EngineError.js";
import { httpRequestService } from "../services/httpRequest.service.js";
import type { InstanceModel, NodeModel } from "../types/models.js";
import { NodeTypes } from "../types/enums.js";
import { converterUtils } from "./converter.utils.js";

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

  async evaluateContext(
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

        fetchedResponses[urlId] = await httpRequestService.get(
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
    dataType?: T,
  ): DataTypeMap[T] {
    const result = evaluate(expression, context);

    if (!result || result.warnings.length > 0) {
      throw new DataIntegrityError(`Invalid FEEL expression ${expression}`);
    }

    if (dataType && !isValidType(result.value, dataType)) {
      throw new DataIntegrityError(
        `Invalid FEEL expression ${expression}, expected ${dataType}, got ${typeof result.value}`,
      );
    }

    return result.value as DataTypeMap[T];
  },

  getTaskContext(
    instanceContext: ContextVariables,
    inputSchema: NodeInputSchema,
  ): ContextVariables {
    const { constants, fetchables, urls } = instanceContext;
    const taskContext: ContextVariables = {
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
