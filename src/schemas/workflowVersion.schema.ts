import { z } from "zod";
import { ActorSchema } from "./actor.schema.js";
import { NodeSchema, EdgeSchema } from "./node.schema.js";
import { WorkflowVersionStatuses } from "../types/enums.js";

export const WorkflowVersionCreateSchema = z.object({
  workflowId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  actor: ActorSchema,
});

export const WorkflowVersionListSchema = z.object({
  workflowId: z.uuidv4(),
  actor: ActorSchema,
});

export const WorkflowVersionDetailSchema = z.object({
  versionId: z.uuidv4(),
  actor: ActorSchema,
});

export const WorkflowVersionUpdateStatusSchema = z.object({
  versionId: z.uuidv4(),
  actor: ActorSchema,
  status: z.enum([
    WorkflowVersionStatuses.PUBLISHED,
    WorkflowVersionStatuses.ACTIVE,
  ]),
});

export const WorkflowVersionValidateSchema = z.object({
  versionId: z.uuidv4(),
  actor: ActorSchema,
});

export const WorkflowVersionUpdateSchema = z.object({
  versionId: z.uuidv4(),
  actor: ActorSchema,
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const WorkflowVersionPromoteSchema = z.object({
  versionId: z.uuidv4(),
  actor: ActorSchema,
});
