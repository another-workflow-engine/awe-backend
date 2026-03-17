import { db } from "../database.js";
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { UserTaskExecutor } from "./executors/UserTaskExecutor.js";
import { DecisionNodeExecutor } from "./executors/DecisionNodeExecutor.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { ScriptNodeExecutor } from "./executors/ScriptNodeExecutor.js";
import { taskService } from "../services/task.service.js";
import { taskExecutionService } from "../services/taskExecution.service.js";
import { instanceService } from "../services/instance.service.js";
import type { InstanceStatus } from "../types/database.js";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models.js";
import type {
  ContextVariables,
  ExecutorResult,
  NodeRunResult,
} from "../types/engine.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { taskRepository } from "../repositories/task.repository.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  // [NodeTypes.USER]: new UserTaskExecutor(),
  // [NodeTypes.DECISION]: new DecisionNodeExecutor(),
  [NodeTypes.SCRIPT]: new ScriptNodeExecutor(),
};

export const executionEngine = {
  runNode: async (
    instance: InstanceModel,
    node: NodeModel,
    task: TaskModel,
  ): Promise<NodeRunResult> => {
    const res = await Promise.all([
      instanceRepository.updateById(instance.id, {
        status: InstanceStatuses.IN_PROGRESS,
      }),
      taskRepository.updateById(task.id, {
        status: TaskStatuses.IN_PROGRESS,
      }),
    ]);

    const inputVariablesJson = converterUtils.jsonValueToObject(
      instance.input_variables,
    );

    const inputVariables =
      node.type === NodeTypes.START
        ? ({
            constants: inputVariablesJson,
            fetchables: {},
            urls: {},
          } as ContextVariables)
        : (converterUtils.jsonValueToObject(
            instance.current_variables,
          ) as ContextVariables);

    // console.log(instance.input_variables);
    // console.log(inputVariablesJson);
    // console.log(inputVariables);

    const executor = executors[node.type];
    if (!executor) {
      throw new Error(`Executor for node type="${node.type}" not found`);
    }

    const taskExecution = await taskExecutionService.startNew(
      task.id,
      TaskStatuses.IN_PROGRESS,
      inputVariables,
    );

    let result: ExecutorResult = {
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: {},
      nextNodeId: null,
    };

    let nodeThrew = false;

    try {
      result = await executor.execute(node, inputVariables);
    } catch (err) {
      console.error(err);
      nodeThrew = true;
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

    let currentVariables: ContextVariables;

    if (node.type === NodeTypes.START) {
      currentVariables = result.outputVariables as ContextVariables;
    } else if (node.type !== NodeTypes.END) {
      currentVariables = converterUtils.jsonValueToObject(
        instance.current_variables,
      ) as ContextVariables;
      currentVariables.constants = {
        ...currentVariables.constants,
        ...result.outputVariables,
      };
    }

    let instanceStatus: InstanceStatus;

    if (nodeThrew) {
      instanceStatus = InstanceStatuses.FAILED;
    } else if (
      result.status === TaskStatuses.IN_PROGRESS &&
      node.type === NodeTypes.USER
    ) {
      instanceStatus = InstanceStatuses.PAUSED;
    } else if (result.status === TaskStatuses.TERMINATED) {
      instanceStatus = InstanceStatuses.TERMINATED;
    } else if (node.type === NodeTypes.END) {
      instanceStatus = InstanceStatuses.COMPLETED;
    } else if (
      result.nextNodeId === null ||
      result.status === TaskStatuses.FAILED
    ) {
      instanceStatus = InstanceStatuses.FAILED;
    } else {
      instanceStatus = instance.auto_advance
        ? InstanceStatuses.IN_PROGRESS
        : InstanceStatuses.PAUSED;
    }

    db.transaction().execute(async (transaction) => {
      let instanceUpdate;
      if (node.type === NodeTypes.END && !nodeThrew) {
        instanceUpdate = instanceService.end(
          instance.id,
          instanceStatus,
          result.outputVariables,
          transaction,
        );
      } else {
        instanceUpdate = instanceService.updateContext(
          instance.id,
          instanceStatus,
          currentVariables,
          result.nextNodeId,
          transaction,
        );
      }

      await Promise.all([
        taskExecutionService.end(
          taskExecution.id,
          result.status,
          result.outputVariables,
          transaction,
        ),
        taskService.updateStatus(task.id, result.status, transaction),
        instanceUpdate,
      ]);
    });

    return {
      nextNodeIds:
        result.nextNodeId === null || !instance.auto_advance
          ? []
          : [result.nextNodeId],
    };
  },
};
