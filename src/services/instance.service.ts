import { instanceRepository } from "../repositories/instance.repository.js";
import { taskRepository } from "../repositories/task.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { edgeRepository } from "../repositories/edge.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel, InstanceModel } from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { queueService } from "./queue.service.js";
import { edgeResolver } from "../engine/EdgeResolver.js";
import { contextManager } from "../engine/ContextManager.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { InstanceStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import { executionLogger } from "../utils/executionLogger.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

export const instanceService = {
  listAll: async (actorId: string): Promise<InstanceListItem[]> => {
    return instanceRepository.findAll(actorId);
  },

  createNew: async (
    data: CreateVersionInput,
    actor: ActorModel,
  ): Promise<InstanceModel> => {
    const workflowVersion =
      await workflowVersionService.getActiveVersionByWorkflowId(
        data.workflowId,
      );
    if (!workflowVersion) {
      throw new NotFoundError("No active workflow version found");
    }

    const { instance, startNodeId } = await db
      .transaction()
      .execute(async (tx) => {
        const newInstance = await instanceRepository.insert(
          {
            workflow_version_id: workflowVersion.id,
            started_on: new Date(),
            status: InstanceStatuses.IN_PROGRESS,
            input_variables: converterUtils.objectToJsonValue(data.context),
            auto_advance: data.autoAdvance,
            created_by: actor.id,
          },
          tx,
        );
        const startNode =
          await nodeService.getByStartNodeByWorkflowVersionIdOrThrow(
            workflowVersion.id,
            tx,
          );
        return { instance: newInstance, startNodeId: startNode.id };
      });

    await queueService.enqueue({
      instanceId: instance.id,
      nodeId: startNodeId,
      context: contextManager.create(),
    });

    executionLogger.instanceCreated({
      instanceId: instance.id,
      workflowId: data.workflowId,
      workflowVersionId: workflowVersion.id,
      workflowName: String(
        (workflowVersion as Record<string, unknown>).name ?? data.workflowId,
      ),
      actorId: actor.id,
      autoAdvance: data.autoAdvance,
      createdAt: new Date(instance.started_on as unknown as string),
      inputVariables: data.context as Record<string, unknown>,
    });

    return instance;
  },

  getById: async (
    instanceId: string,
    actorId: string,
  ): Promise<InstanceModel | undefined> => {
    return instanceRepository.findDetailByIdForActor(instanceId, actorId);
  },

  advanceInstance: async (
    instanceId: string,
    actorId: string,
  ): Promise<InstanceModel> => {
    const instance = await instanceRepository.findByIdForActor(
      instanceId,
      actorId,
    );
    if (!instance)
      throw new NotFoundError(`Instance id=${instanceId} not found`);
    if (instance.status !== InstanceStatuses.PAUSED) {
      throw new StateTransitionError(`Instance id=${instanceId} is not paused`);
    }

    const lastTask = await taskRepository.findLastCreatedByInstanceId(
      instanceId,
    );
    if (!lastTask) {
      throw new DataIntegrityError(
        `No task found for instance id=${instanceId}`,
      );
    }

    const context = contextManager.fromJson(instance.current_variables);

    const nodes = await nodeRepository.findByWorkflowVersionId(
      instance.workflow_version_id,
    );
    const edges = await edgeRepository.findByNodeIds(nodes.map((n) => n.id));
    const nextNodeIds = await edgeResolver.resolveNextNodeIds(
      lastTask.node_id,
      context,
      edges,
      nodes,
      instanceId,
    );

    const updated = await instanceRepository.updateById(instanceId, {
      status: InstanceStatuses.IN_PROGRESS,
    });

    for (const nodeId of nextNodeIds) {
      await queueService.enqueue({ instanceId, nodeId, context });
    }

    return updated;
  },
};
