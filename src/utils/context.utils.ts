import type { Context, EvaluatedContext } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";
import type { Warning } from "@bpmn-io/feelin";
import { EngineError } from "../errors/EngineError.js";
import { JSONPath } from "jsonpath-plus";
import { FeelDataType } from "../types/enums.js";
import { isValidFeelType, type FeelDataTypeMap } from "./feel.utils.js";
import { httpService } from "../services/http.service.js";
import { secretService } from "../services/secrets/secret.service.js";

const EXPECTED_RUNTIME_WARNINGS = new Set([
  "NO_VARIABLE_FOUND",
  "NO_CONTEXT_ENTRY_FOUND",
  "NO_PROPERTY_FOUND",
  "INVALID_TYPE",
  "FUNCTION_INVOCATION_FAILURE",
]);

const CONTEXT_REFERENCE_REGEX = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const SECRET_REFERENCE_REGEX = /\bsecret\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

function normalizeSecretValue(value: unknown, secretName: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    throw new EngineError(`Secret ${secretName} resolved to an empty value`);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.secretValue === "string") {
      return record.secretValue;
    }

    if (typeof record.value === "string") {
      return record.value;
    }

    if (typeof record.data === "string") {
      return record.data;
    }

    return JSON.stringify(record);
  }

  return String(value);
}

function extractReferences(expression: string, regex: RegExp): string[] {
  const refs = new Set<string>();

  for (const match of expression.matchAll(regex)) {
    if (match[1]) {
      refs.add(match[1]);
    }
  }

  return [...refs];
}

function getReferencedVariables(
  urlExpression: string,
  headers: Record<string, string>,
): string[] {
  const refs = new Set<string>();

  for (const ref of extractReferences(urlExpression, CONTEXT_REFERENCE_REGEX)) {
    refs.add(ref);
  }

  for (const value of Object.values(headers)) {
    for (const ref of extractReferences(value, CONTEXT_REFERENCE_REGEX)) {
      refs.add(ref);
    }
  }

  return [...refs];
}

function getReferencedSecrets(
  urlExpression: string,
  headers: Record<string, string>,
): string[] {
  const refs = new Set<string>();

  for (const ref of extractReferences(urlExpression, SECRET_REFERENCE_REGEX)) {
    refs.add(ref);
  }

  for (const value of Object.values(headers)) {
    for (const ref of extractReferences(value, SECRET_REFERENCE_REGEX)) {
      refs.add(ref);
    }
  }

  return [...refs];
}

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
    const unresolvedFetchables = new Set(Object.entries(fetchables));

    while (unresolvedFetchables.size > 0) {
      let progress = false;

      for (const entry of Array.from(unresolvedFetchables)) {
        const [varName, { urlId, jsonPath, dataType }] = entry;
        const urlSettings = urls[urlId];
        if (!urlSettings) {
          throw new DataIntegrityError(
            `Context does not have referenced url of id=${urlId} `,
          );
        }

        const requiredVariables = getReferencedVariables(
          urlSettings.urlExpression,
          urlSettings.headers,
        );
        const requiredSecrets = getReferencedSecrets(
          urlSettings.urlExpression,
          urlSettings.headers,
        );

        const hasVariables = requiredVariables.every(
          (name) => name in evaluatedContext.context,
        );
        const hasSecrets = requiredSecrets.every(
          (name) => name in evaluatedContext.secret,
        );

        if (!hasVariables || !hasSecrets) {
          continue;
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

        evaluatedContext.context[varName] = varValue;
        unresolvedFetchables.delete(entry);
        progress = true;
      }

      if (!progress) {
        const problems = Array.from(unresolvedFetchables).map(
          ([varName, { urlId }]) => {
            const urlSettings = urls[urlId];
            const missingVariables = urlSettings
              ? getReferencedVariables(
                  urlSettings.urlExpression,
                  urlSettings.headers,
                ).filter((name) => !(name in evaluatedContext.context))
              : [];
            const missingSecrets = urlSettings
              ? getReferencedSecrets(
                  urlSettings.urlExpression,
                  urlSettings.headers,
                ).filter((name) => !(name in evaluatedContext.secret))
              : [];

            const missingParts = [
              ...(missingVariables.length > 0
                ? [`missing context variables: ${missingVariables.join(", ")}`]
                : []),
              ...(missingSecrets.length > 0
                ? [`missing secrets: ${missingSecrets.join(", ")}`]
                : []),
            ];

            return `${varName}${missingParts.length > 0 ? ` (${missingParts.join("; ")})` : ""}`;
          },
        );

        throw new DataIntegrityError(
          `Unable to resolve fetchable context variables due to circular or missing dependencies: ${problems.join("; ")}`,
        );
      }
    }

    return evaluatedContext;
  },

  getFeelEvaluatedValue<T extends FeelDataType>(
    expression: string,
    context: EvaluatedContext,
    dataType?: T,
  ): FeelDataTypeMap[T] {
    const result = evaluate(expression, context);

    const unexpectedWarnings = (result?.warnings ?? []).filter(
      (warning: Warning) => !EXPECTED_RUNTIME_WARNINGS.has(warning.type),
    );

    if (!result || unexpectedWarnings.length > 0) {
      throw new DataIntegrityError(`Invalid FEEL expression ${expression}`);
    }

    // For string expressions, be robust and always coerce the result to a
    // primitive string instead of failing on non-primitive values (e.g.
    // boxed String objects or provider-specific wrappers). This avoids
    // runtime errors like "expected string, got object" when the value is
    // still safely representable as a string.
    if (dataType === FeelDataType.STRING) {
      if (typeof result.value !== "string") {
        return String(result.value) as FeelDataTypeMap[T];
      }
    }

    if (dataType && !isValidFeelType(result.value, dataType)) {
      throw new DataIntegrityError(
        `Invalid FEEL expression ${expression}, expected ${dataType}, got ${typeof result.value}`,
      );
    }

    return result.value as FeelDataTypeMap[T];
  },
};
