import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel, InstanceModel, TaskModel } from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { LogEventTypes, InstanceStatuses, TaskStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import type {
  DB,
  InstanceEventType,
  InstanceStatus,
} from "../types/database.js";
import type { Transaction } from "kysely";
import { taskRepository } from "../repositories/task.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { eventLogService } from "./eventLog.service.js";
import { taskService } from "./task.service.js";
import { workflowService } from "./workflow.service.js";
import { getLogger } from "../logger.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { engineUtils } from "../utils/engine.utils.js";
import { taskExecutionService } from "./taskExecution.service.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

type UpdateInstanceStatusParams = {
  instanceId: string;
  status: InstanceStatus;
  outputVariables?: Record<string, unknown>;
  details?: LogDetailSchema | undefined;
  actorId?: string | undefined;
  transaction?: Transaction<DB> | undefined;
};

const instanceStatusToEventMap: Record<InstanceStatus, InstanceEventType> = {
  in_progress: LogEventTypes.RESUMED,
  paused: LogEventTypes.PAUSED,
  completed: LogEventTypes.COMPLETED,
  failed: LogEventTypes.FAILED,
  terminated: LogEventTypes.TERMINATED,
};

const nonTerminalStatus: InstanceStatus[] = [
  InstanceStatuses.IN_PROGRESS,
  InstanceStatuses.PAUSED,
];

async function updateInstanceStatus(
  params: UpdateInstanceStatusParams,
): Promise<InstanceModel> {
  const isTerminalUpdate = !nonTerminalStatus.includes(params.status);

  const executeCallback = async (transaction: Transaction<DB>) => {
    const [instance] = await Promise.all([
      instanceRepository.updateById(
        params.instanceId,
        {
          status: params.status,
          control_signal: null,

          ...(isTerminalUpdate && {
            ended_on: new Date(),
            current_node_id: null,
            output_variables: params.outputVariables
              ? converterUtils.objectToJsonValue(params.outputVariables)
              : {},
          }),
        },
        transaction,
      ),

      eventLogService.createInstanceLog({
        instanceId: params.instanceId,
        eventType: instanceStatusToEventMap[params.status],
        details: params.details,
        actorId: params.actorId,
        transaction: params.transaction,
      }),
    ]);

    return instance;
  };

  const instance = params.transaction
    ? await executeCallback(params.transaction)
    : await db.transaction().execute(executeCallback);

  getLogger().info(
    { instanceId: params.instanceId, details: params.details },
    `Instance status changed to ${params.status}`,
  );

  return instance;
}

export const instanceService = {
  listAll: async (
    actorId: string,
    environmentIds: string[],
  ): Promise<InstanceListItem[]> => {
    return instanceRepository.findAll(actorId, environmentIds);
  },

  listPaginated: async (
    actorId: string,
    environmentIds: string[],
    limit: number,
    offset: number,
  ): Promise<{
    items: InstanceListItem[];
    total: number;
  }> => {
    return instanceRepository.findWithPagination(
      actorId,
      environmentIds,
      limit,
      offset,
    );
  },

  get: async (
    instanceId: string,
    actorId: string,
    environmentIds: string[],
  ) => {
    const instance = await instanceRepository.findByIdAndEnvironmentIds(
      instanceId,
      environmentIds,
    );
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

    const workflow_name = await workflowService.getWorkflowName(
      workflowVersion.workflow_id,
    );

    const task = await taskRepository.findLatestByInstanceId(instance.id);
    if (!task) {
      return { instance, workflowVersion, node: null, task: null };
    }

    const node = await nodeService.getById(task.node_id);
    if (!node) {
      throw new DataIntegrityError(`Node does not exist id = ${task.node_id}`);
    }

    return { instance, workflow_name, workflowVersion, node, task };
  },

  getLockedInProgressOrPausedRelations: async (
    instanceId: string,
    environmentIdsOrTransaction: string[] | Transaction<DB>,
    maybeTransaction?: Transaction<DB>,
  ) => {
    const isEnvironmentScoped = Array.isArray(environmentIdsOrTransaction);

    if (isEnvironmentScoped) {
      const environmentIds = environmentIdsOrTransaction;
      const transaction = maybeTransaction;

      if (!transaction) {
        throw new DataIntegrityError(
          "Transaction is required when environmentIds are provided",
        );
      }

      const authorizedInstance =
        await instanceRepository.findByIdAndEnvironmentIds(
          instanceId,
          environmentIds,
          transaction,
        );

      if (!authorizedInstance) {
        return {
          instance: undefined,
          task: undefined,
          taskExecution: undefined,
        };
      }

      return await instanceRepository.getLockedInProgressOrPausedRelationsById(
        authorizedInstance.id,
        transaction,
      );
    }

    const transaction = environmentIdsOrTransaction;

    return await instanceRepository.getLockedInProgressOrPausedRelationsById(
      instanceId,
      transaction,
    );
  },

  createNew: async (
    data: CreateVersionInput,
    actor: ActorModel,
    environmentIds: string[],
  ) => {
    const workflowVersion =
      await workflowVersionService.getActiveVersionByWorkflowId(
        data.workflowId,
        environmentIds,
      );
    if (!workflowVersion) {
      throw new NotFoundError("No active workflow version found");
    }

    const startNode = await nodeService.getByStartNodeByWorkflowVersionId(
      workflowVersion.id,
    );
    if (!startNode) {
      throw new DataIntegrityError(
        `No start node for workflow version id=${workflowVersion.id}`,
      );
    }

    const startContext = converterUtils.jsonValueToNodeInputSchema(
      startNode.input_schema,
    );
    const missingVariables = startContext.variableNames.filter(
      (variableName) => !(variableName in data.context),
    );

    if (missingVariables.length > 0) {
      throw new InvalidOperationError(
        "Missing context variables: " + missingVariables,
      );
    }

    return await db.transaction().execute(async (transaction) => {
      let instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersion.id,
          status: data.autoAdvance
            ? InstanceStatuses.IN_PROGRESS
            : InstanceStatuses.PAUSED,
          auto_advance: data.autoAdvance,
          input_variables: converterUtils.objectToJsonValue(data.context),
          created_by: actor.id,
          started_on: new Date(),
          current_node_id: startNode.id,
        },
        transaction,
      );

      await eventLogService.createInstanceLog({
        instanceId: instance.id,
        eventType: LogEventTypes.STARTED,
        actorId: actor.id,
        transaction: transaction,
      });

      if (instance.auto_advance === false) {
        await taskService.createWithStatus(
          startNode,
          instance,
          TaskStatuses.PAUSED,
          transaction,
        );
        return { instance, workflowVersion };
      }

      try {
        await taskService.create(startNode, instance, transaction);
      } catch (err) {
        let message = "Unexpected error";

        if (err instanceof Error) {
          message = err.message || message;
        }
        instance = await instanceService.fail(instance.id, {
          message,
          error: err,
        });
      }

      return { instance, workflowVersion };
    });
  },

  resume: async (
    instanceId: string,
    actor: ActorModel,
    environmentIds: string[],
  ) => {
    const instance = await instanceRepository.findByIdAndEnvironmentIds(
      instanceId,
      environmentIds,
    );
    if (!instance) {
      throw new NotFoundError(`Instance`);
    }

    engineUtils.validateInstanceHasNotEndedOrThrow(instance.status);

    if (
      instance.status !== InstanceStatuses.PAUSED ||
      instance.control_signal !== null
    ) {
      throw new StateTransitionError(
        `Instance id=${instanceId} cannot be resumed`,
      );
    }

    const nextNode = instance.current_node_id
      ? await nodeService.getById(instance.current_node_id)
      : undefined;
    if (!nextNode) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    return await db.transaction().execute(async (transaction) => {
      const updatedInstance = await updateInstanceStatus({
        instanceId: instance.id,
        status: InstanceStatuses.IN_PROGRESS,
        actorId: actor.id,
        transaction,
      });
      await taskService.resume(nextNode, updatedInstance, transaction);
      return updatedInstance;
    });
  },

  fail: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.FAILED,
      details,
      transaction,
    });
  },

  terminate: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.TERMINATED,
      details,
      transaction,
    });
  },

  complete: async (
    instanceId: string,
    outputVariables: Record<string, unknown>,
    details?: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.COMPLETED,
      outputVariables,
      details,
      transaction,
    });
  },

  pause: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.PAUSED,
      details,
      transaction,
    });
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

  retry: async (
    instanceId: string,
    actor: ActorModel,
    environmentIds: string[],
    targetTaskId?: string,
  ) => {
    return await db.transaction().execute(async (transaction) => {
      const instance = await instanceRepository.findByIdAndEnvironmentIds(
        instanceId,
        environmentIds,
        transaction,
      );
      if (!instance) throw new NotFoundError("Instance");

      if (instance.status !== InstanceStatuses.FAILED) {
        throw new StateTransitionError(
          `Instance is not FAILED. Status is ${instance.status}`,
        );
      }

      let taskToRetry: TaskModel;
      if (targetTaskId) {
        const t = await taskRepository.findById(targetTaskId, transaction);
        if (!t || t.instance_id !== instanceId) throw new NotFoundError("Task");
        taskToRetry = t;
      } else {
        const latestTask = await taskRepository.findLatestByInstanceId(
          instanceId,
          transaction,
        );
        if (!latestTask)
          throw new DataIntegrityError("No task found for instance");
        taskToRetry = latestTask;
      }

      if (taskToRetry.status !== TaskStatuses.FAILED) {
        throw new StateTransitionError(
          `Task is not FAILED. Status is ${taskToRetry.status}`,
        );
      }

      const node = await nodeService.getById(taskToRetry.node_id);
      if (!node) {
        throw new DataIntegrityError(`Node not found id = ${taskToRetry.node_id}`);
      }

      const updatedInstance = await updateInstanceStatus({
        instanceId: instance.id,
        status: InstanceStatuses.IN_PROGRESS,
        actorId: actor.id,
        details: { message: "Retrying failed task" },
        transaction,
      });

      await taskService.retry(
        taskToRetry.id,
        updatedInstance,
        node,
        actor.id,
        transaction,
      );

      return updatedInstance;
    });
  },
};
