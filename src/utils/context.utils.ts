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
    const entries = Object.entries(fetchables);
    if (entries.length === 0) {
      return { context: returnContext };
    }

    const CONTEXT_REFERENCE_REGEX = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

    type FetchableMeta = {
      urlId: string;
      jsonPath: string;
      dataType: FeelDataType;
      deps: Set<string>;
    };

    const fetchableMeta: Record<string, FetchableMeta> = {};

    for (const [varName, { urlId, jsonPath, dataType }] of entries) {
      const urlSettings = urls[urlId];
      if (!urlSettings) {
        throw new DataIntegrityError(
          `Context does not have referenced url of id=${urlId} `,
        );
      }

      const deps = new Set<string>();
      const sources: string[] = [
        urlSettings.urlExpression,
        ...Object.values(urlSettings.headers ?? {}),
      ];

      for (const source of sources) {
        if (!source) continue;
        for (const match of source.matchAll(CONTEXT_REFERENCE_REGEX)) {
          if (match[1]) {
            deps.add(match[1]);
          }
        }
      }

      fetchableMeta[varName] = { urlId, jsonPath, dataType, deps };
    }

    const unresolved = new Set(Object.keys(fetchableMeta));

    while (unresolved.size > 0) {
      let progress = false;

      for (const varName of Array.from(unresolved)) {
        const meta = fetchableMeta[varName];
        if (!meta) continue;

        const { urlId, jsonPath, dataType, deps } = meta;

        // A fetchable can be resolved only when all of its
        // referenced context variables are already available.
        const canResolve = Array.from(deps).every(
          (dep) => dep in returnContext,
        );
        if (!canResolve) continue;

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
          for (const [key, value] of Object.entries(urlSettings.headers ?? {})) {
            headers[key] = contextUtils.getFeelEvaluatedValue(
              value,
              {
                context: returnContext,
              },
              FeelDataType.STRING,
            );
          }

          const response = await httpService.get(url, {
            headers,
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
        unresolved.delete(varName);
        progress = true;
      }

      if (!progress) {
        const problems: string[] = [];

        for (const varName of unresolved) {
          const meta = fetchableMeta[varName];
          if (!meta) continue;

          const missingDeps = Array.from(meta.deps).filter(
            (dep) => !(dep in returnContext),
          );

          if (missingDeps.length > 0) {
            problems.push(
              `${varName} depends on missing context variable(s): ${missingDeps.join(", ")}`,
            );
          } else {
            problems.push(`${varName} has unresolved dependencies`);
          }
        }

        throw new DataIntegrityError(
          `Unable to resolve fetchable context variables due to circular or missing dependencies: ${problems.join(
            "; ",
          )}`,
        );
      }
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

    const CONTEXT_REFERENCE_REGEX = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

    const referencedVariables = new Set<string>();

    Object.values(taskContext.urls).forEach((urlSettings) => {
      const sources: string[] = [
        urlSettings.urlExpression,
        ...Object.values(urlSettings.headers ?? {}),
      ];

      for (const source of sources) {
        if (!source) continue;
        for (const match of source.matchAll(CONTEXT_REFERENCE_REGEX)) {
          if (match[1]) {
            referencedVariables.add(match[1]);
          }
        }
      }
    });

    referencedVariables.forEach((variableName) => {
      if (
        variableName in taskContext.constants ||
        variableName in taskContext.fetchables
      ) {
        return;
      }

      if (variableName in constants) {
        taskContext.constants[variableName] = constants[variableName];
        return;
      }

      const fetchable = fetchables[variableName];
      if (fetchable) {
        taskContext.fetchables[variableName] = fetchable;
        const urlSettings = urls[fetchable.urlId];
        if (urlSettings) {
          taskContext.urls[fetchable.urlId] = urlSettings;
        }
      }
    });

    return taskContext;
  },
};
