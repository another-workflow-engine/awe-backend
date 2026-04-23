import { z } from "zod";
import { EdgeSchema, NodeSchema } from "./node.schema.js";
import { EnvironmentTypeSchema } from "./environment.schema.js";

export const WorkflowDefinitionValidateSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowGroupCreateSchema = z.object({
  name: z.string().max(255),
  description: z
    .string()
    .optional()
    .transform((val) => val ?? null),
  environment: EnvironmentTypeSchema,
});

export const WorkflowGroupUpdateSchema = z.object({
  workflowId: z.uuidv4(),
  name: z.string().max(255).optional(),
  description: z.string().optional().nullable(),
});

export const WorkflowIdSchema = z.object({
  workflowId: z.uuidv4(),
});
