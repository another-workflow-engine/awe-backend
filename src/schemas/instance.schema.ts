import { z } from "zod";

export const InstanceCreateSchema = z.object({
  workflowId: z.uuidv4(),
  context: z.record(z.string(), z.unknown()).default({}),
  autoAdvance: z.boolean().default(true),
});

export const InstanceParamsSchema = z.object({
  instanceId: z.uuidv4(),
});
