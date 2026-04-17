import { instanceService } from "../services/instance.service.js";
import { taskService } from "../services/task.service.js";
import type {
  InstanceStatus,
  JsonValue,
  NodeType,
  TaskStatus,
} from "../types/database.js";
import type { ExecutorResult, Context } from "../types/engine.js";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
} from "../types/models.js";
import { converterUtils } from "./converter.utils.js";
import { EngineError } from "../errors/EngineError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { nodeService } from "../services/node.services.js";
import { ContextSchema } from "../schemas/context.schema.js";
import { taskExecutionService } from "../services/taskExecution.service.js";
import { engineUtils } from "./engine.utils.js";

async function applyTaskExecutionUpdates(params: {
  executionResult: ExecutorResult;
  instanceId: string;
  transaction: DbTransaction;
}): Promise<TaskExecutionModel> {
  const { executionResult, instanceId, transaction } = params;

  return executionResult.status === TaskStatuses.COMPLETED
    ? await taskExecutionService.complete(
        instanceId,
        executionResult.executionId,
        executionResult.outputVariables,
        transaction,
      )
    : await taskExecutionService.fail(
        instanceId,
        executionResult.executionId,
        {
          message: executionResult.errorMessage ?? "Unkown error",
          error: executionResult.error,
        },
        transaction,
      );
}

async function applyTaskUpdates(params: {
  executionStatus: TaskStatus;
  task: TaskModel;
  transaction: DbTransaction;
}): Promise<TaskModel> {
  const { executionStatus, task, transaction } = params;

  return executionStatus === TaskStatuses.COMPLETED
    ? taskService.complete(task.instance_id, task.id, transaction)
    : taskService.fail(
        task.instance_id,
        task.id,
        {
          message: `Execution ${executionStatus}`,
        },
        transaction,
      );
}

function getNewInstanceStatus(params: {
  executionStatus: TaskStatus;
  isAutoAdvance: boolean;
  currentNodeType: NodeType;
  nextNodeId: string | null;
}): InstanceStatus {
  const { executionStatus, isAutoAdvance, currentNodeType, nextNodeId } =
    params;

  let instanceStatus: InstanceStatus;

  if (executionStatus === TaskStatuses.FAILED) {
    instanceStatus = InstanceStatuses.FAILED;
  } else if (executionStatus === TaskStatuses.TERMINATED) {
    instanceStatus = InstanceStatuses.FAILED;
  } else if (currentNodeType === NodeTypes.END) {
    instanceStatus = InstanceStatuses.COMPLETED;
  } else if (nextNodeId === null) {
    instanceStatus = InstanceStatuses.FAILED;
  } else {
    instanceStatus = isAutoAdvance
      ? InstanceStatuses.IN_PROGRESS
      : InstanceStatuses.PAUSED;
  }

  return instanceStatus;
}

function getNewInstanceContext(params: {
  currentVariables: JsonValue;
  currentNodeType: NodeType;
  taskOutput: Record<string, unknown>;
}): Context {
  const { currentVariables, currentNodeType, taskOutput } = params;

  if (currentNodeType === NodeTypes.START) {
    return converterUtils.parseOrThrow(ContextSchema, taskOutput);
  }

  const context = converterUtils.parseOrThrow(ContextSchema, currentVariables);

  context.constants = {
    ...context.constants,
    ...taskOutput,
  };

  return context;
}

async function applyInstanceUpdates(params: {
  instance: InstanceModel;
  taskStatus: TaskStatus;
  currentNodeType: NodeType;
  executionResult: ExecutorResult;
  transaction: DbTransaction;
}): Promise<InstanceModel> {
  const {
    instance,
    taskStatus,
    currentNodeType,
    executionResult,
    transaction,
  } = params;
  if (
    currentNodeType === NodeTypes.END &&
    taskStatus === TaskStatuses.COMPLETED
  ) {
    return await instanceService.complete(
      instance.id,
      executionResult.outputVariables,
      {
        message: `Instance completed: End Message - ${executionResult.outputVariables.message || "no message"}`,
      },
      transaction,
    );
  }

  const status = getNewInstanceStatus({
    executionStatus: executionResult.status,
    isAutoAdvance: instance.auto_advance,
    currentNodeType,
    nextNodeId: executionResult.nextNodeId,
  });

  return status === InstanceStatuses.FAILED
    ? await instanceService.fail(
        instance.id,
        {
          message: "Task failed",
        },
        transaction,
      )
    : await instanceService.updateContext(
        instance.id,
        status,
        getNewInstanceContext({
          currentVariables: instance.current_variables,
          currentNodeType,
          taskOutput: executionResult.outputVariables,
        }),
        executionResult.nextNodeId,
        transaction,
      );
}

export const taskCompletionHandler = {
  complete: async (params: {
    instance: InstanceModel;
    task: TaskModel;
    taskExecution: TaskExecutionModel;
    node: NodeModel;
    executionResult: ExecutorResult;
    transaction: DbTransaction;
  }): Promise<{ instance: InstanceModel; task: TaskModel }> => {
    let { instance, task, taskExecution, node, executionResult, transaction } =
      params;

    engineUtils.validateInstanceCanExecuteOrThrow(instance);

    taskExecution = await applyTaskExecutionUpdates({
      executionResult,
      instanceId: instance.id,
      transaction,
    });

    task = await applyTaskUpdates({
      executionStatus: executionResult.status,
      task,
      transaction,
    });

    instance = await applyInstanceUpdates({
      instance,
      taskStatus: task.status,
      currentNodeType: node.type,
      executionResult,
      transaction,
    });

    return { instance, task };
  },
};
