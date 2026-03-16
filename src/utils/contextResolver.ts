import { fetchService } from "../services/fetch.service.js";
import type { WorkflowContext } from "../engine/types.js";
import { executionLogger } from "./executionLogger.js";
import { FeelDataType } from "../types/enums.js";

export type FetchableUrlConfig = {
  url: string;
  headers: Record<string, string>;
};

export type FetchableDescriptor = {
  urlId: string;
  jsonPath: string;
  dataType?: string;
};

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

function coerceToDataType(
  value: unknown,
  dataType: string | undefined,
): unknown {
  if (value === null || value === undefined || dataType === undefined) {
    return value;
  }

  switch (dataType) {
    case FeelDataType.NUMBER: {
      const num = Number(value);
      return Number.isNaN(num) ? value : num;
    }
    case FeelDataType.STRING:
      return String(value);
    case FeelDataType.BOOLEAN: {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }
    default:
      return value;
  }
}

export async function buildFeelContext(
  context: WorkflowContext,
): Promise<{ context: Record<string, unknown> }> {
  const global = context.global;

  const constants = (global.constants as Record<string, unknown>) ?? {};
  const fetchables =
    (global.fetchables as Record<string, FetchableDescriptor>) ?? {};
  const urls = (global.urls as Record<string, FetchableUrlConfig>) ?? {};

  const variables: Record<string, unknown> = { ...constants };

  const structuralKeys = new Set(["constants", "fetchables", "urls"]);
  for (const [key, val] of Object.entries(global)) {
    if (!structuralKeys.has(key)) {
      variables[key] = val;
    }
  }

  const fetchedResponses: Record<string, unknown> = {};
  for (const [varName, { urlId, jsonPath, dataType }] of Object.entries(
    fetchables,
  )) {
    const urlConfig = urls[urlId];
    if (!urlConfig) continue;

    if (!(urlId in fetchedResponses)) {
      fetchedResponses[urlId] = await fetchService.get(
        urlConfig.url,
        urlConfig.headers,
      );
    }

    const rawValue = getByPath(fetchedResponses[urlId], jsonPath);
    variables[varName] = coerceToDataType(rawValue, dataType);

    executionLogger.fetchableResolved({
      varName,
      urlId,
      url: urlConfig.url,
      headers: urlConfig.headers,
      jsonPath,
      value: variables[varName],
    });
  }

  const directVars = Object.entries(constants).map(([name, value]) => ({
    name,
    value,
  }));
  const mergedVars = Object.entries(global)
    .filter(([k]) => !structuralKeys.has(k))
    .map(([name, value]) => ({ name, value }));
  const fetchableList = Object.entries(fetchables).map(([name, { urlId }]) => ({
    name,
    urlId,
  }));

  executionLogger.contextResolution({
    directVariables: directVars,
    mergedVariables: mergedVars,
    fetchableVars: fetchableList,
  });

  return { context: variables };
}
