import { z } from "zod";
import { EnvironmentTypes } from "../types/enums.js";
import type { EnvironmentType } from "../types/database.js";

const EnvironmentTypeSchema = z.enum([
  EnvironmentTypes.DEVELOPMENT,
  EnvironmentTypes.STAGING,
  EnvironmentTypes.PRODUCTION,
]);

export function parseEnvironmentTypesFromQuery(rawValue: unknown): EnvironmentType[] {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return [];
  }

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const parsedValues = values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => EnvironmentTypeSchema.parse(value));

  return [...new Set(parsedValues)];
}

export function getEnvironmentTypeById(
  environmentIds: string[],
  environmentTypes: EnvironmentType[],
  environmentId: string,
): EnvironmentType | undefined {
  const index = environmentIds.indexOf(environmentId);
  return index >= 0 ? environmentTypes[index] : undefined;
}
