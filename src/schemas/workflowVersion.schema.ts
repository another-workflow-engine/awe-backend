import { z } from "zod";
import { NodeSchema, EdgeSchema } from "./node.schema.js";
import {
  EnvironmentTypes,
  VersionIncrementType,
  WorkflowVersionStatuses,
} from "../types/enums.js";
import { PaginationParamsSchema } from "./pagination.schema.js";

export const WorkflowVersionListRequestSchema = z.object({
  ...PaginationParamsSchema.shape,
  workflowId: z.uuidv4(),
});

export const WorkflowVersionCreateRequestSchema = z.object({
  workflowId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowVersionIdSchema = z.object({
  versionId: z.uuidv4(),
});

export const WorkflowVersionUpdateRequestSchema = z.object({
  versionId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowVersionUpdateStatusRequestSchema = z.object({
  versionId: z.uuidv4(),
  incrementType: z
    .enum(VersionIncrementType)
    .default(VersionIncrementType.MAJOR),
});

export const WorkflowVersionPromoteResponseSchema = z.object({
  workflowId: z.uuidv4(),
  versionId: z.uuidv4(),
  sourceEnvironment: z.enum([
    EnvironmentTypes.DEVELOPMENT,
    EnvironmentTypes.STAGING,
  ]),
  targetEnvironment: z.enum([
    EnvironmentTypes.STAGING,
    EnvironmentTypes.PRODUCTION,
  ]),
});

export type ListWorkflowVersionsInput = z.infer<
  typeof WorkflowVersionListRequestSchema
>;

export type CreateVersionInput = z.infer<
  typeof WorkflowVersionCreateRequestSchema
>;

export type UpdateVersionInput = z.infer<
  typeof WorkflowVersionUpdateRequestSchema
>;

export type PromoteVersionOutput = z.infer<
  typeof WorkflowVersionPromoteResponseSchema
>;

export type StatusPartialUpdateInput = z.infer<
  typeof WorkflowVersionUpdateStatusRequestSchema
>;
