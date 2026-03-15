import { taskRepository } from "../repositories/task.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { edgeRepository } from "../repositories/edge.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { contextManager } from "../engine/ContextManager.js";
import { edgeResolver } from "../engine/EdgeResolver.js";
import { queueService } from "./queue.service.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { TaskStatuses, InstanceStatuses } from "../types/enums.js";
import { executionLogger } from "../utils/executionLogger.js";

export async function resumeUserTask(
  taskId: string,
  userInput: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new NotFoundError(`Task id=${taskId}`);
  if (task.status !== TaskStatuses.IN_PROGRESS) {
    throw new StateTransitionError(`Task id=${taskId} is not awaiting user input`);
  }

  const instance = await instanceRepository.findByIdForActor(task.instance_id, actorId);
  if (!instance) throw new NotFoundError(`Instance not found for task id=${taskId}`);
  if (instance.status !== InstanceStatuses.PAUSED) {
    throw new StateTransitionError(`Instance id=${instance.id} is not paused`);
  }

  const nodes = await nodeRepository.findByWorkflowVersionId(instance.workflow_version_id);
  const node = nodes.find((n) => n.id === task.node_id);
  if (!node) throw new DataIntegrityError(`Node id=${task.node_id} not found`);

  const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);
  if (!parsed.data) throw new DataIntegrityError(`User node configuration invalid for node id=${node.id}`);

  const outputVariables: Record<string, unknown> = {};
  for (const field of parsed.data.responseMap) {
    if (field.contextVariable) {
      outputVariables[field.contextVariable.name] = userInput[field.fieldId];
    }
  }

  const edges = await edgeRepository.findByNodeIds(nodes.map((n) => n.id));
  const context = contextManager.fromJson(instance.current_variables);
  const updatedContext = contextManager.merge(context, outputVariables);
  const nextNodeIds = edgeResolver.resolveNextNodeIds(task.node_id, updatedContext, edges, nodes);

  await db.transaction().execute(async (tx) => {
    await taskRepository.updateById(taskId, { status: TaskStatuses.COMPLETED }, tx);
    await instanceRepository.updateById(instance.id, {
      status: InstanceStatuses.IN_PROGRESS,
      current_variables: converterUtils.objectToJsonValue(updatedContext),
    }, tx);
  });

  executionLogger.userTaskCompleted({
    taskId,
    instanceId:     instance.id,
    actorId,
    completedAt:    new Date(),
    userInput,
    contextUpdates: outputVariables,
  });

  for (const nodeId of nextNodeIds) {
    await queueService.enqueue({ instanceId: instance.id, nodeId, context: updatedContext });
  }
}
