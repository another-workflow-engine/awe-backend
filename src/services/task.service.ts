import {
  taskRepository,
  type TaskDetailItem,
} from "../repositories/task.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { contextManager } from "../engine/ContextManager.js";
import { buildFeelContext } from "../utils/contextResolver.js";
import { evaluate } from "@bpmn-io/feelin";
import type { JsonValue } from "../types/database.js";

export type ResolvedTaskItem = TaskDetailItem & {
  resolvedDisplayData: Record<string, unknown>;
};

export const taskService = {
  listPending: async (actorId: string): Promise<TaskDetailItem[]> => {
    return taskRepository.findAllPending(actorId);
  },

  getTask: async (
    taskId: string,
    actorId: string,
  ): Promise<ResolvedTaskItem | undefined> => {
    const task = await taskRepository.findByIdWithContext(taskId, actorId);
    if (!task) return undefined;

    const resolvedDisplayData: Record<string, unknown> = {};

    const configParsed = UserNodeConfigurationSchema.safeParse(
      task.node_configuration,
    );
    if (configParsed.success) {
      const context = contextManager.fromJson(
        task.instance_context as JsonValue,
      );
      const feelContext = await buildFeelContext(context);

      for (const field of configParsed.data.requestMap) {
        const result = evaluate(field.valueExpression, feelContext);
        resolvedDisplayData[field.label] = result.value;
      }
    }

    return { ...task, resolvedDisplayData };
  },
};
