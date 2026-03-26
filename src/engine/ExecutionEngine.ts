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
import { taskExecutionService } from "../services/taskExecution.service.js";
import { instanceService } from "../services/instance.service.js";
import type { DB, InstanceStatus, NodeType } from "../types/database.js";
import type {
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
} from "../types/models.js";
import type { ContextVariables, ExecutorResult } from "../types/engine.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { contextUtils } from "../utils/context.utils.js";
import { nodeService } from "../services/node.services.js";
import { userTaskService } from "../services/userTask.service.js";
import { queueService } from "../services/queue.service.js";
import { EngineError } from "../errors/EngineError.js";
import type { Transaction } from "kysely";
import { StateTransitionError } from "../errors/StateTransitionError.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.DECISION]: new DecisionNodeExecutor(),
  [NodeTypes.SCRIPT]: new ScriptNodeExecutor(),
  [NodeTypes.SERVICE]: new ServiceNodeExecutor(),
};

function getExecutionContext(node: NodeModel, instance: InstanceModel) {
  let instanceContext: ContextVariables = {
    constants: {},
    fetchables: {},
    urls: {},
  };

  if (node.type === NodeTypes.START) {
    instanceContext.constants = converterUtils.jsonValueToObject(
      instance.input_variables,
    );
  } else {
    instanceContext = converterUtils.jsonValueToContextVariables(
      instance.current_variables,
    );
  }

  const nodeInputSchema = converterUtils.jsonValueToNodeInputSchema(
    node.input_schema,
  );

  return contextUtils.getTaskExecutionContext(instanceContext, nodeInputSchema);
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
    fetchables: {...instanceContext.fetchables},
    urls: {...instanceContext.urls},
  };
}

function getUpdatedInstanceStatus(
  isAutoAdvance: boolean,
  executionThrew: boolean,
  result: ExecutorResult,
  nodeType: NodeType,
) {
  let instanceStatus: InstanceStatus;

  if (executionThrew) {
    instanceStatus = InstanceStatuses.FAILED;
  } else if (
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

async function getNextNode(
  nextNodeId: string | null,
  nodeType: NodeType,
  executionThrew: boolean,
) {
  if (nodeType === NodeTypes.END || executionThrew === true) {
    return undefined;
  }

  if (nextNodeId === null) {
    throw new EngineError(`No next node for node id = ${nextNodeId}`);
  }

  const nextNode = await nodeService.getById(nextNodeId);
  if (!nextNode) {
    throw new EngineError(`Node not found node id = ${nextNodeId}`);
  }

  return nextNode;
}

export const executionEngine = {
  startInstance: async (
    workflowVersionId: string,
    isAutoAdvance: boolean,
    inputVariables: Record<string, unknown>,
    actorId: string,
  ): Promise<InstanceModel> => {
    return await db.transaction().execute(async (transaction) => {
      const startNode =
        await nodeService.getByStartNodeByWorkflowVersionIdOrThrow(
          workflowVersionId,
          transaction,
        );

      const instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersionId,
          started_on: new Date(),
          status: isAutoAdvance
            ? InstanceStatuses.IN_PROGRESS
            : InstanceStatuses.PAUSED,
          input_variables: converterUtils.objectToJsonValue(inputVariables),
          auto_advance: isAutoAdvance,
          created_by: actorId,
          current_node_id: startNode.id,
        },
        transaction,
      );

      if (instance.auto_advance) {
        await executionEngine.createNextTask(startNode, instance, transaction);
      }

      return instance;
    });
  },

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

    let executionThrew = false;
    const executor = executors[node.type];
    if (!executor) {
      await db.transaction().execute(async (transaction) => {
        await instanceService.updateStatus(
          instance.id,
          InstanceStatuses.FAILED,
          transaction,
        );
        await taskService.updateStatus(
          task.id,
          TaskStatuses.FAILED,
          transaction,
        );
      });

      throw new EngineError(`Executor for node type="${node.type}" not found`);
    }

    let result: ExecutorResult = {
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: {},
      nextNodeId: null,
    };

    let taskExecution: TaskExecutionModel;

    try {
      executionEngine.validateInstanceCanExecuteOrThrow(instance);

      const executionContext = getExecutionContext(node, instance);

      taskExecution = await taskExecutionService.startNew(
        task.id,
        TaskStatuses.IN_PROGRESS,
        executionContext,
      );

      result = await executor.execute(node, executionContext);
    } catch (err) {
      console.error(err);
      executionThrew = true;
      let message = "Unknown error";

      if (err instanceof Error) {
        message = err.message;
      }
      result = {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: message,
        nextNodeId: null,
      };
    }

    const updateInstanceStatus = getUpdatedInstanceStatus(
      instance.auto_advance,
      executionThrew,
      result,
      node.type,
    );

    const updateInstanceContext = getUpdatedInstanceContext(
      node,
      result.outputVariables,
      instance,
    );

    const nextNode = await getNextNode(
      result.nextNodeId,
      node.type,
      executionThrew,
    );

    await db.transaction().execute(async (transaction) => {
      let instanceUpdateCallback;

      if (
        node.type === NodeTypes.END &&
        !executionThrew &&
        nextNode === undefined
      ) {
        instanceUpdateCallback = instanceService.end(
          instance.id,
          updateInstanceStatus,
          result.outputVariables,
          transaction,
        );
      } else if (updateInstanceStatus === InstanceStatuses.FAILED) {
        instanceUpdateCallback = instanceService.end(
          instance.id,
          updateInstanceStatus,
          {},
          transaction,
        );
      } else {
        instanceUpdateCallback = instanceService.updateContext(
          instance.id,
          updateInstanceStatus,
          updateInstanceContext,
          result.nextNodeId,
          transaction,
        );
      }

      const [updatedtaskExecution, updatedtask, updatedInstance] =
        await Promise.all([
          taskExecution
            ? taskExecutionService.end(
                taskExecution.id,
                result.status,
                result.outputVariables,
                transaction,
              )
            : Promise.resolve(),
          taskService.updateStatus(task.id, result.status, transaction),
          instanceUpdateCallback,
        ]);

      if (nextNode && instance.auto_advance) {
        await executionEngine.createNextTask(
          nextNode,
          updatedInstance,
          transaction,
        );
      }
    });
  },

  createNextTask: async (
    node: NodeModel,
    instance: InstanceModel,
    transaction: Transaction<DB>,
  ) => {
    let instanceStatus: InstanceStatus;

    if (instance.auto_advance || node.type === NodeTypes.USER) {
      instanceStatus = InstanceStatuses.IN_PROGRESS;
    } else {
      instanceStatus = InstanceStatuses.PAUSED;
    }

    const updatedInstance = await instanceService.updateStatus(
      instance.id,
      instanceStatus,
      transaction,
    );

    const task = await taskService.createNew(
      updatedInstance.id,
      node.id,
      TaskStatuses.IN_PROGRESS,
      transaction,
    );

    if (node.type !== NodeTypes.USER) {
      await queueService.enqueue({
        taskId: task.id,
      });
      return;
    }
    console.log("user task", node)
    console.log(getExecutionContext(node, instance))
    await userTaskService.createNew(
      node,
      task,
      getExecutionContext(node, instance),
      transaction,
    );
  },
};
