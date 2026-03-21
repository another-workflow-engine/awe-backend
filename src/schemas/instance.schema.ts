import { z } from "zod";

export const InstanceCreateSchema = z.object({
  workflowId: z.uuidv4(),
  context: z.record(z.string(), z.unknown()).optional().default({}),
  autoAdvance: z.boolean().optional().default(true),
});

export const InstanceParamsSchema = z.object({
  instanceId: z.uuidv4(),
});
