import { fetchService } from "../services/fetch.service.js";
import type { WorkflowContext } from "../engine/types.js";
import { executionLogger } from "./executionLogger.js";

export type FetchableUrlConfig = {
  url: string;
  headers: Record<string, string>;
};

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}


export async function buildFeelContext(
  context: WorkflowContext,
): Promise<{ context: Record<string, unknown> }> {
  const global = context.global;

  const constants = (global.constants as Record<string, unknown>) ?? {};
  const fetchables =
    (global.fetchables as Record<
      string,
      { urlId: string; jsonPath: string }
    >) ?? {};
  const urls =
    (global.urls as Record<string, FetchableUrlConfig>) ?? {};


  const variables: Record<string, unknown> = { ...constants };

  const structuralKeys = new Set(["constants", "fetchables", "urls"]);
  for (const [key, val] of Object.entries(global)) {
    if (!structuralKeys.has(key)) {
      variables[key] = val;
    }
  }


  const fetchedResponses: Record<string, unknown> = {};
  for (const [varName, { urlId, jsonPath }] of Object.entries(fetchables)) {
    const urlConfig = urls[urlId];
    if (!urlConfig) continue;

    if (!(urlId in fetchedResponses)) {
      fetchedResponses[urlId] = await fetchService.get(
        urlConfig.url,
        urlConfig.headers,
      );
    }

    variables[varName] = getByPath(fetchedResponses[urlId], jsonPath);

    executionLogger.fetchableResolved({
      varName,
      urlId,
      url:      urlConfig.url,
      headers:  urlConfig.headers,
      jsonPath,
      value:    variables[varName],
    });
  }


  const structuralKeysSet = new Set(["constants", "fetchables", "urls"]);
  const directVars = Object.entries(constants).map(([name, value]) => ({ name, value }));
  const mergedVars = Object.entries(global)
    .filter(([k]) => !structuralKeysSet.has(k))
    .map(([name, value]) => ({ name, value }));
  const fetchableList = Object.entries(fetchables).map(([name, { urlId }]) => ({ name, urlId }));

  executionLogger.contextResolution({
    directVariables:  directVars,
    mergedVariables:  mergedVars,
    fetchableVars:    fetchableList,
  });

  return { context: variables };
}
