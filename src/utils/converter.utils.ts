import { DataIntegrityError } from "../errors/DataIntegrity.js";
import type { JsonValue } from "../types/database.js";
import { TimeUnit } from "../types/enums.js";
import type { NodeModel } from "../types/models.js";
import type { NodeInputSchema } from "../types/workflow.js";
import { z } from "zod";

function isNodeInputSchema(value: unknown): value is NodeInputSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.variableNames) &&
    obj.variableNames.every((v) => typeof v === "string")
  );
}

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

  jsonValueToNodeInputSchema: (value: JsonValue): NodeInputSchema => {
    if (!isNodeInputSchema(value)) {
      throw new DataIntegrityError("Invalid node input schema");
    }

    const obj = value as Record<string, unknown>;
    return {
      variableNames: obj.variableNames as string[],
      secretNames: Array.isArray(obj.secretNames)
        ? obj.secretNames.filter(
            (name): name is string => typeof name === "string",
          )
        : [],
    };
  },

  parseOrThrow<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    errorMessage = "Invalid data",
  ): T {
    const result = schema.safeParse(data);

    if (result.success === false) {
      throw new DataIntegrityError(errorMessage, result.error);
    }

    return result.data;
  },
};

export const TimeConstants = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
} as const;

export function convertToMilliseconds(delay: number, unit: TimeUnit): number {
  switch (unit) {
    case TimeUnit.MILLISECOND:
      return delay;
    case TimeUnit.SECOND:
      return delay * TimeConstants.SECOND;
    case TimeUnit.MINUTE:
      return delay * TimeConstants.MINUTE;
  }
}
