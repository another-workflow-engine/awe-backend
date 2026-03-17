import type { ContextVariables } from "../engine/executors/BaseExecutor";
import type { JsonValue } from "../types/database";

export const converterUtils = {
  jsonValueToObject: (value: JsonValue): object => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as object;
  },

  objectToJsonValue: (value: object): JsonValue => {
    return value as JsonValue;
  },
};
