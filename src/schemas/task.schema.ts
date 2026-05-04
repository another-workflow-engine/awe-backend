import { z } from "zod";
import { PaginationParamsSchema } from "./pagination.schema.js";
import { EnvironmentQuerySchema } from "./environment.schema.js";

export const TaskIdSchema = z.object({
  taskId: z.uuidv4(),
});

export const TaskRetryRequestSchema = z.object({
  taskId: z.uuidv4(),
  context: z.record(z.string(), z.unknown()).default({}),
});

export type TaskRetryInput = z.infer<typeof TaskRetryRequestSchema>;

export const PendingUserTaskListRequestSchema = z.object({
  ...PaginationParamsSchema.shape,
  assignee: z.string().optional(),
  environment: EnvironmentQuerySchema,
});

export type PendingUserTaskListInput = z.infer<
  typeof PendingUserTaskListRequestSchema
>;
