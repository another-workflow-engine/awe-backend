import z from "zod";
import { EnvironmentTypes } from "../types/enums.js";

export const EnvironmentTypeSchema = z.enum(EnvironmentTypes);

export const EnvironmentSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  type: EnvironmentTypeSchema,
});

export const EnvironmentQuerySchema = z
  .object({
    environment: z
      .union([EnvironmentTypeSchema, z.array(EnvironmentTypeSchema)])
      .transform((val) => (Array.isArray(val) ? val : [val]))
      .default([]),
  })
  .transform((obj) => obj.environment);
