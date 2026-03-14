import type { JsonValue } from "../types/database";

export const converterUtils = {
  jsonValueToObject: (value: JsonValue): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  },

  objectToJsonValue: (value: object): JsonValue => {
    return value as JsonValue;
  },
};
