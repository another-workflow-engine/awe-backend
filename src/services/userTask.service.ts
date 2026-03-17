import { taskRepository } from "../repositories/task.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { queueService } from "./queue.service.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { TaskStatuses, InstanceStatuses } from "../types/enums.js";
import { edgeService } from "./edge.services.js";
import { instanceService } from "./instance.service.js";
import type { ContextVariables } from "../types/engine.js";
import { taskService } from "./task.service.js";

export async function resumeUserTask(
  taskId: string,
  userInput: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new NotFoundError(`Task id=${taskId}`);
  if (task.status !== TaskStatuses.IN_PROGRESS) {
    throw new StateTransitionError(
      `Task id=${taskId} is not awaiting user input`,
    );
  }

  const instance = await instanceRepository.findByIdForActor(
    task.instance_id,
    actorId,
  );
  if (!instance)
    throw new NotFoundError(`Instance not found for task id=${taskId}`);
  if (instance.status !== InstanceStatuses.IN_PROGRESS) {
    throw new StateTransitionError(
      `Instance id=${instance.id} is not in progress`,
    );
  }

  const node = await nodeRepository.findById(task.node_id);
  if (!node) throw new DataIntegrityError(`Node id=${task.node_id} not found`);

  const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);
  if (!parsed.success)
    throw new DataIntegrityError(
      `User node configuration invalid for node id=${node.id}`,
    );

  const configuration = parsed.data;

  const outputVariables: Record<string, unknown> = {};
  for (const field of configuration.responseMap) {
    if (field.contextVariable) {
      outputVariables[field.contextVariable.name] = userInput[field.fieldId];
    }
  }

  const currentVariables = converterUtils.jsonValueToObject(
    instance.current_variables,
  ) as ContextVariables;

  currentVariables.constants = {
    ...currentVariables.constants,
    ...outputVariables,
  };

  const [nextNodeId] = await edgeService.getNextNodeIdsBySourceNodeId(node.id);

  await db.transaction().execute(async (tx) => {
    await instanceService.updateContext(
      instance.id,
      instance.auto_advance
        ? InstanceStatuses.IN_PROGRESS
        : InstanceStatuses.PAUSED,
      currentVariables,
      nextNodeId ?? null,
      tx,
    );

    await taskRepository.updateById(
      taskId,
      { status: TaskStatuses.COMPLETED },
      tx,
    );

    if (!nextNodeId) {
      throw new DataIntegrityError(
        "No node after user node. End node missing.",
      );
    }

    if (instance.auto_advance) {
      const newTask = await taskService.createNew(
        instance.id,
        nextNodeId,
        TaskStatuses.IN_PROGRESS,
        tx,
      );

      await queueService.enqueue({
        taskId: newTask.id,
      });
    }
  });
}
