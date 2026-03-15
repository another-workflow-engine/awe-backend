import { z } from "zod";

export const TaskParamsSchema = z.object({
  taskId: z.uuidv4(),
});

export const TaskCompleteSchema = z.object({
  userInput: z.record(z.string(), z.unknown()).default({}),
});
