import { Transaction } from "kysely";
import { db } from "../database.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { instanceService } from "../services/instance.service.js";
import { taskService } from "../services/task.service.js";
import type { DB, InstanceStatus } from "../types/database.js";
import type { ExecutorResult, QueueJobData } from "../types/engine.js";
import { InstanceControlSignals, TaskStatuses } from "../types/enums.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskModel,
} from "../types/models.js";
import { EngineError } from "../errors/EngineError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { nodeService } from "../services/node.services.js";
import { getLogger } from "../logger.js";
import { statusUtils } from "./status.utils.js";
import { taskCompletionHandler } from "./taskCompletion.handler.js";

async function dispatchNextNode(params: {
  instance: InstanceModel;
  transaction: DbTransaction;
}): Promise<TaskModel> {
  const { instance, transaction } = params;

  const nextNodeId = instance.current_node_id;
  if (nextNodeId === null) {
    throw new EngineError(`Next node is null`);
  }

  const nextNode = await nodeService.getById(nextNodeId);
  if (!nextNode) {
    throw new DataIntegrityError(`Node not found node id = ${nextNodeId}`);
  }

  return await taskService.create({
    instance,
    node: nextNode,
    transaction,
  });
}

export const engineUtils = {
  validateInstanceHasNotEndedOrThrow: (status: InstanceStatus) => {
    if (statusUtils.instanceHasEnded(status)) {
      throw new StateTransitionError(
        `Instance has ended with status=${status}.`,
      );
    }
  },

  validateInstanceCanExecuteOrThrow: (instance: InstanceModel) => {
    if (!statusUtils.instanceCanExecute(instance)) {
      throw new StateTransitionError(
        `Instance is ${instance.status}. Cannot execute next task.`,
      );
    }
  },

  validateTaskCanExecuteOrThrow: (task: TaskModel) => {
    if (statusUtils.taskHasEnded(task.status)) {
      throw new StateTransitionError(
        `Task has ended with status=${task.status}. Cannot be executed.`,
      );
    }

    if (task.status === TaskStatuses.PAUSED) {
      throw new StateTransitionError(
        `Task is ${task.status}. Cannot be executed.`,
      );
    }
  },

  processControlSignal: async (params: {
    instance: InstanceModel;
    task: TaskModel;
    transaction: Transaction<DB>;
  }): Promise<{ instance: InstanceModel; task: TaskModel }> => {
    const controlHandlers = {
      [InstanceControlSignals.PAUSE]: {
        task: taskService.pause,
        instance: instanceService.pause,
        taskMessage: "Instance was paused",
        instanceMessage: (taskId: string) =>
          `Paused due to signal. Paused at task id=${taskId}`,
      },
      [InstanceControlSignals.TERMINATE]: {
        task: taskService.terminate,
        instance: instanceService.terminate,
        taskMessage: "Instance was terminated",
        instanceMessage: (taskId: string) =>
          `Terminated due to signal. Terminated at task id=${taskId}`,
      },
    };

    let { instance, task } = params;

    if (!instance.control_signal) {
      return { instance, task };
    }

    const handler = controlHandlers[instance.control_signal];
    if (!handler) {
      throw new EngineError(
        `Unhandled control signal: ${instance.control_signal}`,
      );
    }

    if (!statusUtils.taskHasEnded(task.status)) {
      task = await handler.task(
        instance.id,
        task.id,
        { message: handler.taskMessage },
        params.transaction,
      );
    }

    if (!statusUtils.instanceHasEnded(instance.status)) {
      instance = await handler.instance(
        instance.id,
        { message: handler.instanceMessage(task.id) },
        params.transaction,
      );
    }

    return { instance, task };
  },

  onTaskFailure: async (params: {
    instanceId: string;
    taskId: string;
    message: string;
    error: unknown;
  }) => {
    const { instanceId, taskId, message, error } = params;

    await db.transaction().execute(async (transaction) => {
      await taskService.fail(
        instanceId,
        taskId,
        { message, error },
        transaction,
      );

      await instanceService.fail(
        instanceId,
        { message: "Task failed" },
        transaction,
      );
    });

    getLogger().error(
      { error, taskId, instanceId },
      `[Task failed] ${message}`,
    );
  },

  lockAndExecute: <T>(
    jobData: QueueJobData,
    callback: (
      instance: InstanceModel,
      task: TaskModel,
      node: NodeModel,
      transaction: Transaction<DB>,
    ) => Promise<T>,
  ): Promise<T> => {
    const { instanceId, nodeId } = jobData;
    getLogger().info({ job: jobData }, "Locking job models");

    return db.transaction().execute(async (transaction) => {
      const [{ instance, task, taskExecution }, node] = await Promise.all([
        instanceService.getLockedInProgressOrPausedRelations(
          instanceId,
          transaction,
        ),
        nodeService.getByIdOrThrow(nodeId),
      ]);

      if (!instance || !task) {
        throw new DataIntegrityError(
          `Unable to lock data for job data=${jobData}`,
        );
      }

      if (taskExecution) {
        throw new DataIntegrityError(
          `Task execution id=${taskExecution.id} for job data=${jobData} exists`,
        );
      }

      return callback(instance, task, node, transaction);
    });
  },

  completeTask: async (params: {
    jobData: QueueJobData;
    executionResult: ExecutorResult;
  }): Promise<void> => {
    const { jobData, executionResult } = params;
    db.transaction()
      .execute(async (transaction) => {
        let [{ instance, task, taskExecution }, node] = await Promise.all([
          instanceService.getLockedInProgressOrPausedRelations(
            jobData.instanceId,
            transaction,
          ),
          nodeService.getByIdOrThrow(jobData.nodeId),
        ]);

        if (
          !instance ||
          !task ||
          !taskExecution ||
          taskExecution.id !== executionResult.executionId
        ) {
          throw new DataIntegrityError(
            `Unable to lock data for job data=${jobData}`,
          );
        }

        ({ instance, task } = await taskCompletionHandler.complete({
          instance,
          task,
          taskExecution,
          node,
          executionResult,
          transaction,
        }));

        engineUtils.processControlSignal({ instance, task, transaction });

        if (!statusUtils.instanceCanExecute(instance)) {
          return;
        }

        await dispatchNextNode({ instance, transaction }).catch(() => {
          instanceService.fail(
            instance.id,
            { message: "Task creation failed" },
            transaction,
          );
        });
      })
      .catch((error) => {
        engineUtils.onTaskFailure({
          instanceId: jobData.instanceId,
          taskId: jobData.taskId,
          message: "Failed to update instance",
          error,
        });
      });
  },
};
