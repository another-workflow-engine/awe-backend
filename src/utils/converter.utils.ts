import { DataIntegrityError } from "../errors/DataIntegrity.js";
import type { JsonValue } from "../types/database.js";
import { TimeUnit } from "../types/enums.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
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
    return value;
  },

  jsonValueToLogDetailSchema: (value: JsonValue): LogDetailSchema => {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value.message === "string"
    ) {
      return { message: value.message };
    }

    throw new DataIntegrityError("Invalid Instance Log Detail schema");
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
