import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel, InstanceModel } from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { InstanceStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import type { DB, InstanceStatus } from "../types/database.js";
import type { Transaction } from "kysely";
import { executionEngine } from "../engine/ExecutionEngine.js";
import { taskRepository } from "../repositories/task.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

export const instanceService = {
  listAll: async (actorId: string): Promise<InstanceListItem[]> => {
    return instanceRepository.findAll(actorId);
  },

  createNew: async (data: CreateVersionInput, actor: ActorModel) => {
    const workflowVersion =
      await workflowVersionService.getActiveVersionByWorkflowId(
        data.workflowId,
      );
    if (!workflowVersion) {
      throw new NotFoundError("No active workflow version found");
    }

    const instance = await executionEngine.startInstance(
      workflowVersion.id,
      data.autoAdvance,
      data.context,
      actor.id,
    );

    return { instance, workflowVersion };
  },

  get: async (instanceId: string, actorId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) {
      throw new NotFoundError("Instance");
    }

    const workflowVersion = await workflowVersionRepository.findById(
      instance.workflow_version_id,
    );
    if (!workflowVersion) {
      throw new DataIntegrityError(
        `Workflow version does not exist id = ${instance.workflow_version_id}`,
      );
    }

    const task = await taskRepository.findLatestByInstanceId(instance.id);
    if (!task) {
      return { instance, workflowVersion, node: null, task: null };
    }

    const node = await nodeService.getById(task.node_id);
    if (!node) {
      throw new DataIntegrityError(`Node does not exist id = ${task.node_id}`);
    }

    return { instance, workflowVersion, node, task };
  },

  advanceInstance: async (
    instanceId: string,
    actor: ActorModel,
  ): Promise<InstanceModel> => {
    const instance = await instanceRepository.findById(instanceId);
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

    const nextNode = await nodeService.getById(instance.current_node_id);
    if (!nextNode) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    db.transaction().execute(async (transaction) => {
      await executionEngine.createNewTask(nextNode, instance, transaction);
    });

    const updatedInstance = await instanceRepository.findById(instanceId);
    if (!updatedInstance)
      throw new NotFoundError(`Instance id=${instanceId} not found`);

    return updatedInstance;
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

  updateStatus: async (
    instanceId: string,
    status: InstanceStatus,
    transaction?: Transaction<DB>,
  ) => {
    return await instanceRepository.updateById(
      instanceId,
      {
        status: status,
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
