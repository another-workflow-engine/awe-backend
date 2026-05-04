import z from "zod";
import { EnvironmentTypes } from "../types/enums.js";

export const EnvironmentTypeSchema = z.enum(EnvironmentTypes);

export const EnvironmentQuerySchema = z
  .union([EnvironmentTypeSchema, z.array(EnvironmentTypeSchema)])
  .transform((val) => (Array.isArray(val) ? val : [val]))
  .default([]);
