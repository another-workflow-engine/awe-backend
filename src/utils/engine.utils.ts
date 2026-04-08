import { Transaction } from "kysely";
import { db } from "../database.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { instanceService } from "../services/instance.service.js";
import { taskService } from "../services/task.service.js";
import type { DB, InstanceStatus, NodeType, Task } from "../types/database.js";
import type { ExecutorResult, InputVariables } from "../types/engine.js";
import {
  InstanceControlSignals,
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../types/enums.js";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models.js";
import { converterUtils } from "./converter.utils.js";
import { EngineError } from "../errors/EngineError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { nodeService } from "../services/node.services.js";
import { getLogger } from "../logger.js";

async function handleNextNode(
  instance: InstanceModel,
  nextNodeId: string | null,
) {
  if (nextNodeId === null) {
    throw new EngineError(`Next node is null`);
  }

  const nextNode = await nodeService.getById(nextNodeId);
  if (!nextNode) {
    throw new DataIntegrityError(`Node not found node id = ${nextNodeId}`);
  }

  if (nextNode && instance.auto_advance) {
    await taskService.create(nextNode, instance);
  }
}

function getUpdatedInstanceContext(
  node: NodeModel,
  executionOuputVariables: Record<string, unknown>,
  instance: InstanceModel,
): InputVariables {
  if (node.type === NodeTypes.START) {
    return converterUtils.objectToContextVariables(executionOuputVariables);
  }

  const instanceContext = converterUtils.jsonValueToContextVariables(
    instance.current_variables,
  );

  return {
    constants: {
      ...instanceContext.constants,
      ...executionOuputVariables,
    },
    fetchables: { ...instanceContext.fetchables },
    urls: { ...instanceContext.urls },
  };
}

function getUpdatedInstanceStatus(
  isAutoAdvance: boolean,
  result: ExecutorResult,
  nodeType: NodeType,
) {
  let instanceStatus: InstanceStatus;

  if (
    result.status === TaskStatuses.IN_PROGRESS &&
    nodeType === NodeTypes.USER
  ) {
    instanceStatus = InstanceStatuses.PAUSED;
  } else if (result.status === TaskStatuses.TERMINATED) {
    instanceStatus = InstanceStatuses.TERMINATED;
  } else if (nodeType === NodeTypes.END) {
    instanceStatus = InstanceStatuses.COMPLETED;
  } else if (
    result.nextNodeId === null ||
    result.status === TaskStatuses.FAILED
  ) {
    instanceStatus = InstanceStatuses.FAILED;
  } else {
    instanceStatus = isAutoAdvance
      ? InstanceStatuses.IN_PROGRESS
      : InstanceStatuses.PAUSED;
  }

  return instanceStatus;
}

async function applyInstanceUpdate(
  instance: InstanceModel,
  node: NodeModel,
  result: ExecutorResult,
  instanceStatus: InstanceStatus,
  instanceContext: InputVariables,
  transaction: Transaction<DB>,
): Promise<InstanceModel> {
  if (node.type === NodeTypes.END && result.status === TaskStatuses.COMPLETED) {
    const details = {
      message: `Instance completed: End Message - ${result.outputVariables?.message || "no message"}`,
    };
    return await instanceService.complete(
      instance.id,
      result.outputVariables,
      details,
      transaction,
    );
  }

  if (
    instanceStatus === InstanceStatuses.FAILED ||
    result.nextNodeId === null
  ) {
    return await instanceService.fail(
      instance.id,
      {
        message:
          instanceStatus === InstanceStatuses.FAILED
            ? "Task failed"
            : "Next node not found",
      },
      transaction,
    );
  }

  return await instanceService.updateContext(
    instance.id,
    instanceStatus,
    instanceContext,
    result.nextNodeId,
    transaction,
  );
}

export const engineUtils = {
  validateInstanceHasNotEndedOrThrow: (status: InstanceStatus) => {
    if (
      status === InstanceStatuses.FAILED ||
      status === InstanceStatuses.TERMINATED ||
      status === InstanceStatuses.COMPLETED
    ) {
      throw new StateTransitionError(
        `Instance has ended with status=${status}.`,
      );
    }
  },

  validateInstanceCanExecuteOrThrow: (instance: InstanceModel) => {
    engineUtils.validateInstanceHasNotEndedOrThrow(instance.status);

    if (instance.auto_advance && instance.status === InstanceStatuses.PAUSED) {
      throw new StateTransitionError(
        `Instance is ${instance.status}. Cannot execute next task.`,
      );
    }
  },

  validateTaskCanExecuteOrThrow: (task: TaskModel) => {
    if (
      task.status === TaskStatuses.FAILED ||
      task.status === TaskStatuses.TERMINATED ||
      task.status === TaskStatuses.COMPLETED
    ) {
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

  handleInstanceControlSignal: async (
    instance: InstanceModel,
    task: TaskModel,
    node: NodeModel,
    transaction?: Transaction<DB>,
  ): Promise<{ instance: InstanceModel; task: TaskModel }> => {
    const executeCallback = async (transaction: Transaction<DB>) => {
      if (instance.control_signal === InstanceControlSignals.PAUSE) {
        task = await taskService.pause(
          instance.id,
          task.id,
          { message: "Instance was paused." },
          transaction,
        );

        instance = await instanceService.pause(
          instance.id,
          {
            message: `Paused due to signal. Paused at node=${node.client_id}`,
          },
          transaction,
        );

        return { instance, task };
      } else if (instance.control_signal === InstanceControlSignals.TERMINATE) {
        task = await taskService.terminate(
          instance.id,
          task.id,
          { message: "Instance was terminated." },
          transaction,
        );

        instance = await instanceService.terminate(
          instance.id,
          {
            message: `Terminated due to signal. Terminated at node=${node.client_id}`,
          },
          transaction,
        );

        return { instance, task };
      }

      return { instance, task };
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },

  onExecutionFailure: async (err: unknown, task: TaskModel) => {
    let message = "Unknown error";
    let error = undefined;

    if (err instanceof Error) {
      message = err.message;
      error = err;
    }

    getLogger().error(
      { error: err, task: task },
      `[Execution failure] ${message}`,
    );

    await db.transaction().execute(async (transaction) => {
      await taskService.fail(
        task.instance_id,
        task.id,
        { message, error: err },
        transaction,
      );
      await instanceService.fail(
        task.instance_id,
        { message: "Task failed" },
        transaction,
      );
    });
  },

  updateInstanceAndTask: async (
    instance: InstanceModel,
    node: NodeModel,
    task: TaskModel,
    result: ExecutorResult,
  ) => {
    try {
      const instanceStatus = getUpdatedInstanceStatus(
        instance.auto_advance,
        result,
        node.type,
      );

      instance = await db.transaction().execute(async (transaction) => {
        const instanceContext = getUpdatedInstanceContext(
          node,
          result.outputVariables,
          instance,
        );

        if (result.status === TaskStatuses.COMPLETED) {
          await taskService.complete(instance.id, task.id, transaction);
        } else {
          await taskService.fail(instance.id, task.id, {
            message: `Execution ${result.status}`,
          });
        }

        return await applyInstanceUpdate(
          instance,
          node,
          result,
          instanceStatus,
          instanceContext,
          transaction,
        );
      });
    } catch (err) {
      await engineUtils.onExecutionFailure(err, task);
      return;
    }

    if (
      instance.auto_advance === false ||
      instance.status !== InstanceStatuses.IN_PROGRESS ||
      node.type === NodeTypes.END
    ) {
      return;
    }

    const updatedModels = await engineUtils.handleInstanceControlSignal(
      instance,
      task,
      node,
    );

    instance = updatedModels.instance;
    task = updatedModels.task;

    try {
      engineUtils.validateInstanceCanExecuteOrThrow(instance);
      await handleNextNode(instance, result.nextNodeId);
    } catch (err) {
      getLogger().info({ error: err }, "Cannot go to next node");
      return;
    }
  },
};
