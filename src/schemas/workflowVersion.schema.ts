import { z } from "zod";
import { ActorSchema } from "./actor.schema.js";
import { NodeSchema, EdgeSchema } from "./node.schema.js";
import { WorkflowVersionStatuses } from "../types/enums.js";

export const WorkflowVersionCreateRequestSchema = z.object({
  workflowId: z.uuidv4(),
  description: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  // deleteContextVariablesOnEnd: z.boolean(),
  actor: ActorSchema
})

export const WorkflowVersionDetailRequestSchema = z.object({
  workflowId: z.uuidv4(),
  version: z.coerce.number().min(1),
  actor: ActorSchema,
});

export const WorkflowVersionUpdateStatusRequestSchema = z.object({
  workflowId: z.uuidv4(),
  version: z.coerce.number().min(1),
  actor: ActorSchema,
  status: z.enum([
    WorkflowVersionStatuses.PUBLISHED,
    WorkflowVersionStatuses.ACTIVE,
  ]),
});

export const WorkflowVersionValidateRequestSchema = z.object({
  workflowId: z.uuidv4(),
  version: z.coerce.number().min(1),
  actor: ActorSchema,
});