import { DataIntegrityError } from "../errors/DataIntegrity";
import type { JsonValue } from "../types/database";
import type {
  ContextVariables,
  FetchableSettings,
  UrlSettings,
} from "../types/engine";
import type { LogDetailSchema } from "../types/instanceLog";
import type { NodeInputSchema } from "../types/workflow";
import { z } from "zod";

function isNodeInputSchema(value: unknown): value is NodeInputSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.variableNames) &&
    obj.variableNames.every((v) => typeof v === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  jsonValueToContextVariables: (value: JsonValue): ContextVariables => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DataIntegrityError("Invalid context variables");
    }

    const obj = value as Record<string, unknown>;

    if (!obj.constants || !obj.fetchables || !obj.urls) {
      throw new DataIntegrityError("Invalid context variables");
    }

    return obj as unknown as ContextVariables;
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

  objectToContextVariables: (
    obj: Record<string, unknown>,
  ): ContextVariables => {
    return {
      constants: isRecord(obj.constants) ? obj.constants : {},
      fetchables: isRecord(obj.fetchables)
        ? (obj.fetchables as Record<string, FetchableSettings>)
        : {},
      urls: isRecord(obj.urls) ? (obj.urls as Record<string, UrlSettings>) : {},
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
