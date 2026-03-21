import { fetchService } from "../services/fetch.service.js";
import type { ContextVariables } from "../types/engine.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { evaluate } from "@bpmn-io/feelin";

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);

  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, data);
}

export async function buildFeelContext(
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
        if (result.warnings.length !== 0 || typeof result.value !== "string") {
          throw new DataIntegrityError(`Invalid FEEL expression "${value}"`);
        }

        headers[key] = result.value;
      }

      fetchedResponses[urlId] = await fetchService.get(result.value, headers);
    }

    const rawValue = getByPath(fetchedResponses[urlId], jsonPath);
    returnContext[varName] = rawValue;
  }

  return { context: returnContext };
}
