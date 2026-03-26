import { db } from "../database.js";
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { DecisionNodeExecutor } from "./executors/DecisionNodeExecutor.js";
import { ServiceNodeExecutor } from "./executors/ServiceNodeExecuter.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { ScriptNodeExecutor } from "./executors/ScriptNodeExecutor.js";
import { taskService } from "../services/task.service.js";
import { instanceService } from "../services/instance.service.js";
import type { DB, InstanceStatus, NodeType } from "../types/database.js";
import type { InstanceModel, NodeModel } from "../types/models.js";
import type { ContextVariables, ExecutorResult } from "../types/engine.js";
import { nodeService } from "../services/node.services.js";
import { EngineError } from "../errors/EngineError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import type { Transaction } from "kysely";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.DECISION]: new DecisionNodeExecutor(),
  [NodeTypes.SCRIPT]: new ScriptNodeExecutor(),
  [NodeTypes.SERVICE]: new ServiceNodeExecutor(),
};

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
    fetchables: {},
    urls: {},
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

async function getNextNode(nextNodeId: string, currentNodeType: NodeType) {
  if (currentNodeType === NodeTypes.END) {
    return null;
  }

  const nextNode = await nodeService.getById(nextNodeId);
  if (!nextNode) {
    throw new EngineError(`Node not found node id = ${nextNodeId}`);
  }

  return nextNode;
}

export const executionEngine = {
  validateInstanceCanExecuteOrThrow: (instance: InstanceModel) => {
    if (
      instance.status === InstanceStatuses.FAILED ||
      instance.status === InstanceStatuses.TERMINATED ||
      instance.status === InstanceStatuses.COMPLETED
    ) {
      throw new StateTransitionError(
        `Instance has already ${instance.status}. Cannot execute next node.`,
      );
    }

    if (
      !instance.auto_advance &&
      instance.status === InstanceStatuses.IN_PROGRESS
    ) {
      throw new StateTransitionError("Instance is in execution");
    }

    if (instance.auto_advance && instance.status === InstanceStatuses.PAUSED) {
      throw new StateTransitionError(`Instance is ${InstanceStatuses.PAUSED}`);
    }
  },

  executeTask: async (taskId: string) => {
    const { instance, node, task } =
      await taskService.getAllTaskDetails(taskId);

    console.log("Executing:", node.type);

    const executionContext = taskService.getTaskContext(instance, node);
    const taskExecution = await taskService.start(task.id, executionContext);
    if (!taskExecution) {
      await instanceService.fail(
        instance.id,
        `Failed to start execution of task id = ${taskId}`,
        {},
      );
      return;
    }

    const executor = executors[node.type];
    if (!executor) {
      await taskService.fail(taskExecution.task_id, "Executor not found", {});
      await instanceService.fail(
        instance.id,
        `Executor for node type="${node.type}" not found`,
        {},
      );
      return;
    }

    let result: ExecutorResult = {
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: {},
      nextNodeId: null,
    };

    let updateInstanceContext = null;
    let nextNode = null;

    try {
      executionEngine.validateInstanceCanExecuteOrThrow(instance);

      const executionContext = taskService.getTaskContext(instance, node);

      result = await executor.execute(node, executionContext);

      updateInstanceContext = getUpdatedInstanceContext(
        node,
        result.outputVariables,
        instance,
      );

      if (result.nextNodeId !== null) {
        nextNode = await getNextNode(result.nextNodeId, node.type);
      }
    } catch (err) {
      console.error(err);
      let message = "Unknown error";

      if (err instanceof Error) {
        message = err.message;
      }

      await taskService.fail(task.id, message, { err });
      await instanceService.fail(instance.id, message, { err });
      return;
    }

    const updateInstanceStatus = getUpdatedInstanceStatus(
      instance.auto_advance,
      result,
      node.type,
    );

    await db.transaction().execute(async (transaction) => {
      let instanceUpdateCallback;

      if (
        node.type === NodeTypes.END &&
        result.status === TaskStatuses.COMPLETED &&
        nextNode === null
      ) {
        instanceUpdateCallback = async (transaction: Transaction<DB>) => {
          return await instanceService.end(
            instance.id,
            updateInstanceStatus,
            result.outputVariables,
            transaction,
          );
        };
      } else if (
        updateInstanceStatus === InstanceStatuses.FAILED ||
        nextNode === null
      ) {
        instanceUpdateCallback = async (transaction: Transaction<DB>) => {
          return await instanceService.fail(
            instance.id,
            result.error ?? "",
            {},
            transaction,
          );
        };
      } else {
        instanceUpdateCallback = async (transaction: Transaction<DB>) => {
          return await instanceService.updateContext(
            instance.id,
            updateInstanceStatus,
            updateInstanceContext ?? {},
            nextNode.id,
            transaction,
          );
        };
      }

      const [updatedTask, updatedInstance] = await Promise.all([
        taskService.end(
          taskExecution,
          result.status,
          result.outputVariables,
          transaction,
        ),
        instanceUpdateCallback(transaction),
      ]);

      if (nextNode && instance.auto_advance) {
        await taskService.create(nextNode, updatedInstance);
      }
    });
  },
};
