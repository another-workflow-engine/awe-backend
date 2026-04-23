import { z } from "zod";

export const TaskParamsSchema = z.object({
  taskId: z.uuidv4(),
});

export const TaskRetrySchema = z.object({
  taskId: z.uuid(),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});
