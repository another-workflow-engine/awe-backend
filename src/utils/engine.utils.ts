import { Transaction } from "kysely";
import { db } from "../database";
import { StateTransitionError } from "../errors/StateTransitionError";
import { instanceService } from "../services/instance.service";
import { taskService } from "../services/task.service";
import type { DB, InstanceStatus, NodeType } from "../types/database";
import type { ContextVariables, ExecutorResult } from "../types/engine";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models";
import { converterUtils } from "./converter.utils";
import { EngineError } from "../errors/EngineError";
import { DataIntegrityError } from "../errors/DataIntegrity";
import { nodeService } from "../services/node.services";
import { getLogger } from "../logger";

async function handleNextNode(
  instance: InstanceModel,
  currentNodeType: NodeType,
  nextNodeId: string | null,
) {
  if (currentNodeType === NodeTypes.END) {
    return;
  }

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
): ContextVariables {
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
  wasLastAttempt: boolean,
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
    wasLastAttempt &&
    (result.nextNodeId === null || result.status === TaskStatuses.FAILED)
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
  instanceContext: ContextVariables,
  wasLastAttempt: boolean,
  transaction: Transaction<DB>,
): Promise<InstanceModel> {
  if (node.type === NodeTypes.END && result.status === TaskStatuses.COMPLETED) {
    const details = { message: `Instance completed: End Message - ${result.outputVariables?.message || "no message"}` };
    return await instanceService.complete(
      instance.id,
      result.outputVariables,
      transaction,
      details,
    );
  }

  if (
    wasLastAttempt &&
    (instanceStatus === InstanceStatuses.FAILED || result.nextNodeId === null)
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
  validateInstanceCanExecuteOrThrow: (instance: InstanceModel) => {
    if (
      instance.status === InstanceStatuses.FAILED ||
      instance.status === InstanceStatuses.TERMINATED ||
      instance.status === InstanceStatuses.COMPLETED
    ) {
      throw new StateTransitionError(
        `Instance has ${instance.status}. Cannot execute next node.`,
      );
    }

    if (instance.auto_advance && instance.status === InstanceStatuses.PAUSED) {
      throw new StateTransitionError(`Instance is ${InstanceStatuses.PAUSED}`);
    }
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
        error,
        transaction,
      );
      await instanceService.fail(task.instance_id, { message }, transaction);
    });
  },

  updateInstanceAndTask: async (
    instance: InstanceModel,
    node: NodeModel,
    task: TaskModel,
    result: ExecutorResult,
    wasLastAttempt: boolean,
  ) => {
    let updatedInstance;

    try {
      const instanceStatus = getUpdatedInstanceStatus(
        instance.auto_advance,
        result,
        node.type,
        wasLastAttempt,
      );

      const instanceContext = getUpdatedInstanceContext(
        node,
        result.outputVariables,
        instance,
      );

      updatedInstance = await db.transaction().execute(async (transaction) => {
        if (result.status === TaskStatuses.COMPLETED) {
          await taskService.complete(task, transaction);
        } else if (wasLastAttempt) {
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
          wasLastAttempt,
          transaction,
        );
      });
    } catch (err) {
      await engineUtils.onExecutionFailure(err, task);
      return;
    }

    if (
      updatedInstance.auto_advance === false ||
      updatedInstance.status !== InstanceStatuses.IN_PROGRESS
    ) {
      return;
    }

    try {
      engineUtils.validateInstanceCanExecuteOrThrow(updatedInstance);
      await handleNextNode(updatedInstance, node.type, result.nextNodeId);
    } catch (err) {
      getLogger().info({ error: err }, "Cannot go to next node");
      return;
    }
  },
};
