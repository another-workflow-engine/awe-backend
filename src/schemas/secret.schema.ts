import z from "zod";
import {
  EnvironmentQuerySchema,
  EnvironmentTypeSchema,
} from "./environment.schema.js";

export const CreateNewSecretRequestSchema = z.object({
  providerId: z.uuidv4(),
  environment: EnvironmentTypeSchema,
  key: z.string(),
});

export const ListSecretRequestSchema = z.object({
  providerId: z.uuidv4().optional(),
  environment: EnvironmentQuerySchema,
});

export type CreateNewSecretInput = z.infer<typeof CreateNewSecretRequestSchema>;
export type ListSecretInput = z.infer<typeof ListSecretRequestSchema>;
