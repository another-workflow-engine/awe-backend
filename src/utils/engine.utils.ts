import { Transaction } from "kysely";
import { db } from "../database.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { instanceService } from "../services/instance.service.js";
import { taskService } from "../services/task.service.js";
import type {
  DB,
  InstanceControlSignal,
  InstanceStatus,
  NodeType,
} from "../types/database.js";
import type { ExecutorResult, Context } from "../types/engine.js";
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
import { ContextSchema } from "../schemas/context.schema.js";

async function handleNextNode(
  instance: InstanceModel,
  nextNodeId: string | null,
  transaction: Transaction<DB>,
) {
  if (nextNodeId === null) {
    throw new EngineError(`Next node is null`);
  }

  const nextNode = await nodeService.getById(nextNodeId);
  if (!nextNode) {
    throw new DataIntegrityError(`Node not found node id = ${nextNodeId}`);
  }
  if (instance.control_signal) {
    const status =
      instance.control_signal === InstanceControlSignals.TERMINATE
        ? TaskStatuses.TERMINATED
        : TaskStatuses.PAUSED;

    const task = await taskService.createWithStatus(
      nextNode,
      instance,
      status,
      transaction,
    );

    await engineUtils.handleInstanceControlSignal({
      instanceId: instance.id,
      controlSignal: instance.control_signal,
      taskId: task.id,
      node: nextNode,
      transaction,
    });
    return;
  }

  if (!instance.auto_advance) {
    await taskService.createWithStatus(
      nextNode,
      instance,
      TaskStatuses.PAUSED,
      transaction,
    );
    return;
  }

  await taskService.create(nextNode, instance, transaction);
}

function getUpdatedInstanceContext(
  node: NodeModel,
  executionOuputVariables: Record<string, unknown>,
  instance: InstanceModel,
): Context {
  if (node.type === NodeTypes.START) {
    return converterUtils.parseOrThrow(ContextSchema, executionOuputVariables);
  }

  const instanceContext = converterUtils.parseOrThrow(
    ContextSchema,
    instance.current_variables,
  );

  return {
    constants: {
      ...instanceContext.constants,
      ...executionOuputVariables,
    },
    fetchables: { ...instanceContext.fetchables },
    urls: { ...instanceContext.urls },
    secrets: { ...instanceContext.secrets },
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
  instanceContext: Context,
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

async function updateInstanceAndTask(
  instance: InstanceModel,
  task: TaskModel,
  node: NodeModel,
  result: ExecutorResult,
  transaction: Transaction<DB>,
): Promise<InstanceModel> {
  const instanceStatus = getUpdatedInstanceStatus(
    instance.auto_advance,
    result,
    node.type,
  );

  const instanceContext = getUpdatedInstanceContext(
    node,
    result.outputVariables,
    instance,
  );

  if (result.status === TaskStatuses.COMPLETED) {
    await taskService.complete(instance.id, task.id, transaction);
  } else {
    await taskService.fail(
      instance.id,
      task.id,
      {
        message: `Execution ${result.status}`,
        error: result.error,
      },
      transaction,
    );
  }

  return await applyInstanceUpdate(
    instance,
    node,
    result,
    instanceStatus,
    instanceContext,
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

  handleInstanceControlSignal: async (params: {
    instanceId: string;
    controlSignal: InstanceControlSignal;
    taskId?: string;
    node: NodeModel;
    transaction: Transaction<DB>;
  }): Promise<{ instance: InstanceModel; task: TaskModel | undefined }> => {
    const controlHandlers = {
      [InstanceControlSignals.PAUSE]: {
        task: taskService.pause,
        instance: instanceService.pause,
        taskMessage: "Instance was paused.",
        instanceMessage: (node: NodeModel) =>
          `Paused due to signal. Paused at node=${node.client_id}`,
      },
      [InstanceControlSignals.TERMINATE]: {
        task: taskService.terminate,
        instance: instanceService.terminate,
        taskMessage: "Instance was terminated.",
        instanceMessage: (node: NodeModel) =>
          `Terminated due to signal. Terminated at node=${node.client_id}`,
      },
    };

    const { instanceId, controlSignal, taskId, node, transaction } = params;

    const handler = controlHandlers[controlSignal];
    if (!handler) {
      throw new EngineError(`Unhandled control signal: ${controlSignal}`);
    }

    const task = taskId
      ? await handler.task(
          instanceId,
          taskId,
          { message: handler.taskMessage },
          transaction,
        )
      : undefined;

    const instance = await handler.instance(
      instanceId,
      { message: handler.instanceMessage(node) },
      transaction,
    );

    return { instance, task };
  },

  onExecutionFailure: async (params: {
    error: unknown;
    instanceId: string;
    taskId: string;
  }) => {
    const { error, instanceId, taskId } = params;
    let message = "Unknown error";

    if (error instanceof Error) {
      message = error.message;
    }

    getLogger().error(
      { error, taskId, instanceId },
      `[Execution failure] ${message}`,
    );

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
  },

  getLockedModels: async (params: {
    instanceId: string;
    taskId: string;
    nodeId: string;
    transaction: Transaction<DB>;
  }): Promise<
    { instance: InstanceModel; task: TaskModel; node: NodeModel } | undefined
  > => {
    const { instanceId, taskId, nodeId, transaction } = params;
    const logger = getLogger();
    const logData = { instanceId, taskId, nodeId };

    let [{ instance, task }, node] = await Promise.all([
      instanceService.getLockedInProgressOrPausedRelations(
        instanceId,
        transaction,
      ),
      nodeService.getByIdOrThrow(nodeId),
    ]);

    if (!instance) {
      logger.error(
        { ...logData },
        "A task for instance exists when instance does not exist",
      );
      return;
    }

    if (!task) {
      logger.info({ ...logData }, "Task is not in progress or paused");
      return;
    }

    return { instance, task, node };
  },

  updateInstanceAndRelations: async (params: {
    instance: InstanceModel;
    task: TaskModel;
    node: NodeModel;
    result: ExecutorResult;
    transaction: Transaction<DB>;
  }): Promise<void> => {
    let { instance, task, node, result, transaction } = params;

    try {
      instance = await updateInstanceAndTask(
        instance,
        task,
        node,
        result,
        transaction,
      );

      try {
        engineUtils.validateInstanceCanExecuteOrThrow(instance);
        await handleNextNode(instance, result.nextNodeId, transaction);
      } catch (err) {
        getLogger().info({ error: err }, "Cannot go to next node");
      }
    } catch (error) {
      await engineUtils.onExecutionFailure({
        error,
        instanceId: instance.id,
        taskId: task.id,
      });
    }
  },
};
