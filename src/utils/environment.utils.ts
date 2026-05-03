import type { EnvironmentType } from "../types/database.js";
import type { EnvironmentModel } from "../types/models.js";
import { EnvironmentTypeSchema } from "../schemas/environment.schema.js";

export const environmentUtils = {
  parseEnvironmentsFromQueryString(rawValue: unknown): EnvironmentType[] {
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
  },

  getFilteredEnvironments(
    allowedEnvironments: EnvironmentModel[],
    selectedEnvironmentTypes: EnvironmentType[],
  ): EnvironmentModel[] {
    if (selectedEnvironmentTypes.length === 0) {
      return allowedEnvironments;
    }

    return allowedEnvironments.filter((env) =>
      selectedEnvironmentTypes.includes(env.type),
    );
  },

  getEnvironmentIds(environments: EnvironmentModel[]): string[] {
    return environments.map((env) => env.id);
  },

  getFilteredEnvironmentIds(
    allowedEnvironments: EnvironmentModel[],
    selectedEnvironmentTypes: EnvironmentType[],
  ): string[] {
    const filteredEnvironments = environmentUtils.getFilteredEnvironments(
      allowedEnvironments,
      selectedEnvironmentTypes,
    );

    return this.getEnvironmentIds(filteredEnvironments);
  },
};
