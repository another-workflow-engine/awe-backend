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
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import { executionLogger } from "../utils/executionLogger.js";
import type { DB, InstanceStatus } from "../types/database.js";
import type { Transaction } from "kysely";
import { taskService } from "./task.service.js";

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

    return await db.transaction().execute(async (tx) => {
      const startNode =
        await nodeService.getByStartNodeByWorkflowVersionIdOrThrow(
          workflowVersion.id,
          tx,
        );

      const instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersion.id,
          started_on: new Date(),
          status: data.autoAdvance
            ? InstanceStatuses.IN_PROGRESS
            : InstanceStatuses.PAUSED,
          input_variables: converterUtils.objectToJsonValue(data.context),
          auto_advance: data.autoAdvance,
          created_by: actor.id,
          current_node_id: startNode.id,
        },
        tx,
      );

      if (instance.auto_advance) {
        const task = await taskService.createNew(
          instance.id,
          startNode.id,
          TaskStatuses.IN_PROGRESS,
          tx,
        );

        await queueService.enqueue({
          taskId: task.id,
        });
      }

      return instance;
    });
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

    if (instance.auto_advance) {
      throw new StateTransitionError(
        `Instance id=${instanceId} is in auto advance state`,
      );
    }

    if (
      instance.status === InstanceStatuses.FAILED ||
      instance.status === InstanceStatuses.TERMINATED ||
      instance.status === InstanceStatuses.COMPLETED
    ) {
      throw new StateTransitionError(
        `Instance id=${instanceId} is has already ended. Cannot advance`,
      );
    }

    if (instance.status === InstanceStatuses.IN_PROGRESS) {
      throw new StateTransitionError(
        `Instance id=${instanceId} is in progress. Wait for previous task.`,
      );
    }

    if (!instance.current_node_id) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    const nextNode = await nodeRepository.findById(instance.current_node_id);
    if (!nextNode) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }
    // if (nextNode.type === NodeTypes.USER) {
    //   throw new StateTransitionError(
    //     `Instance id=${instanceId} waiting for user task completion.`,
    //   );
    // }

    const task = await taskService.createNew(
      instance.id,
      nextNode.id,
      TaskStatuses.IN_PROGRESS,
    );

    await queueService.enqueue({ taskId: task.id });

    return instance;
  },

  updateContext: async (
    instanceId: string,
    status: InstanceStatus,
    currentVariables: object,
    nextNodeId: string | null,
    transaction?: Transaction<DB>,
  ) => {
    return await instanceRepository.updateById(
      instanceId,
      {
        status: status,
        current_variables: converterUtils.objectToJsonValue(currentVariables),
        current_node_id: nextNodeId,
      },
      transaction,
    );
  },

  end: async (
    instanceId: string,
    status: InstanceStatus,
    outputVariables: object,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    return instanceRepository.updateById(
      instanceId,
      {
        status,
        output_variables: converterUtils.objectToJsonValue(outputVariables),
        ended_on: new Date(),
        current_node_id: null,
      },
      transaction,
    );
  },
};
