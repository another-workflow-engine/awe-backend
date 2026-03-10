import { z } from "zod";

export const WorkflowGroupInputSchema = z.object({
  name: z.string().max(255),
  description: z
    .string()
    .optional()
    .transform((val) => val ?? null),
});

export const UpdateGroupInputSchema = z.object({
  workflowId: z.uuidv4(),
  name: z.string().max(255).optional(),
  description: z.string().optional().nullable(),
});

export const WorkflowIdInputSchema = z.object({
  workflowId: z.uuidv4(),
});