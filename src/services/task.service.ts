import { taskRepository } from "../repositories/task.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import type { TaskModel } from "../types/models.js";

export const taskService = {

  getTask: async (taskId: string) => {

    const task = await taskRepository.findById(taskId);
    if (!task) return undefined;

    const node = await nodeRepository.findById(task.node_id);
    if (!node) return undefined;

    const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);

    if (!parsed.success) {
      throw new Error("Invalid user node configuration");
    }

    return {
      id: task.id,
      instanceId: task.instance_id,
      nodeId: task.node_id,
      status: task.status,
      formFields: parsed.data.responseMap
    };
  },
};