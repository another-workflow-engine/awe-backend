import { z } from "zod";
import { ActorSchema } from "./actor.schema.js";
import { NodeSchema, EdgeSchema } from "./node.schema.js";
import {
  EnvironmentTypes,
  VersionIncrementType,
  WorkflowVersionStatuses,
} from "../types/enums.js";

export const WorkflowVersionCreateSchema = z.object({
  workflowId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowVersionListSchema = z.object({
  workflowId: z.uuidv4(),
  actor: ActorSchema,
});

export const WorkflowVersionDetailSchema = z.object({
  versionId: z.uuidv4(),
});

export const WorkflowVersionUpdateStatusSchema = z.object({
  versionId: z.uuidv4(),
  status: z.enum([
    WorkflowVersionStatuses.PUBLISHED,
    WorkflowVersionStatuses.ACTIVE,
  ]),
  incrementType: z
    .enum(VersionIncrementType)
    .default(VersionIncrementType.MAJOR),
});

export const WorkflowVersionValidateSchema = z.object({
  versionId: z.uuidv4(),
});

export const WorkflowVersionUpdateSchema = z.object({
  versionId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowVersionPromoteSchema = z.object({
  versionId: z.uuidv4(),
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
