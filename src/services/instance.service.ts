import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel, InstanceModel } from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { InstanceStatuses, InstanceTransitionTypes } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import type { DB, InstanceStatus } from "../types/database.js";
import type { Transaction } from "kysely";
import { executionEngine } from "../engine/ExecutionEngine.js";
import { taskRepository } from "../repositories/task.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { transitionLogService } from "./transitionLog.service.js";
import { taskService } from "./task.service.js";

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

    let instance = await db.transaction().execute(async (transaction) => {
      const instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersion.id,
          status: data.autoAdvance
            ? InstanceStatuses.IN_PROGRESS
            : InstanceStatuses.PAUSED,
          auto_advance: data.autoAdvance,
          created_by: actor.id,
        },
        transaction,
      );

      await transitionLogService.createInstanceLog(
        {
          instanceId: instance.id,
          actorId: actor.id,
          type: InstanceTransitionTypes.STARTED,
        },
        transaction,
      );

      return instance;
    });

    const startNode = await nodeService.getByStartNodeByWorkflowVersionId(
      instance.workflow_version_id,
    );

    if (!startNode) {
      await instanceService.fail(instance.id, "Start node not found.", {});
      throw new DataIntegrityError(
        `No start node for workflow version id=${instance.workflow_version_id}`,
      );
    }

    try {
      await taskService.create(startNode, instance);
    } catch (err) {
      instance = await instanceService.fail(instance.id, "Task failed.", {});
    }

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

  advanceInstance: async (instanceId: string, actor: ActorModel) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance)
      throw new NotFoundError(`Instance id=${instanceId} not found`);

    if (instance.auto_advance) {
      throw new StateTransitionError(
        `Instance id=${instanceId} is in auto advance state`,
      );
    }

    executionEngine.validateInstanceCanExecuteOrThrow(instance);

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

    await taskService.create(nextNode, instance);
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

  fail: async (
    instanceId: string,
    message: string,
    details: object,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    if (transaction) {
      const [instance] = await Promise.all([
        instanceRepository.updateById(
          instanceId,
          {
            status: InstanceStatuses.FAILED,
            ended_on: new Date(),
            current_node_id: null,
          },
          transaction,
        ),

        await transitionLogService.createInstanceLog(
          {
            type: InstanceTransitionTypes.FAILED,
            instanceId,
            message,
            details,
          },
          transaction,
        ),
      ]);

      return instance;
    }

    return await db.transaction().execute(async (transaction) => {
      const [instance] = await Promise.all([
        instanceRepository.updateById(
          instanceId,
          {
            status: InstanceStatuses.FAILED,
            ended_on: new Date(),
            current_node_id: null,
          },
          transaction,
        ),

        await transitionLogService.createInstanceLog(
          {
            type: InstanceTransitionTypes.FAILED,
            instanceId,
            message,
            details,
          },
          transaction,
        ),
      ]);

      return instance;
    });
  },

  end: async (
    instanceId: string,
    status: InstanceStatus,
    outputVariables: object,
    transaction: Transaction<DB>,
    message?: string,
    details?: object,
  ): Promise<InstanceModel> => {
    const instance = await instanceRepository.updateById(
      instanceId,
      {
        status: status,
        output_variables: converterUtils.objectToJsonValue(outputVariables),
      },
      transaction,
    );

    await transitionLogService.createInstanceLog(
      {
        instanceId: instanceId,
        type: InstanceTransitionTypes.COMPLETED,
      },
      transaction,
    );

    return instance;
  },
};
