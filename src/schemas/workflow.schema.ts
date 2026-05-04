import { z } from "zod";
import { EdgeSchema, NodeSchema } from "./node.schema.js";
import {
  EnvironmentQuerySchema,
  EnvironmentTypeSchema,
} from "./environment.schema.js";
import { PaginationParamsSchema } from "./pagination.schema.js";
import { CreatedSort } from "../types/enums.js";

export const WorkflowListRequestSchema = z.object({
  ...PaginationParamsSchema.shape,
  search: z.string().optional(),
  createdSort: z.enum(CreatedSort).default(CreatedSort.DESCENDING),
  environment: EnvironmentQuerySchema,
});

export const WorkflowCreateRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z
    .string()
    .min(1)
    .optional()
    .transform((val) => val ?? null),
  environment: EnvironmentTypeSchema,
});

export const WorkflowIdSchema = z.object({
  workflowId: z.uuidv4(),
});

export const WorkflowUpdateRequestSchema = z
  .object({
    workflowId: z.uuidv4(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).optional().nullable(),
  })
  .refine((data) => data.name != null || data.description != null, {
    message: "Provide at least one non-empty field to update",
  });

export const WorkflowDefinitionValidateSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type ListWorkflowInput = z.infer<typeof WorkflowListRequestSchema>;

export type CreateWorkflowInput = z.infer<typeof WorkflowCreateRequestSchema>;

export type UpdateWorkflowInput = z.infer<typeof WorkflowUpdateRequestSchema>;
