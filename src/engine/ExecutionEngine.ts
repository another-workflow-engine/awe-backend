import { db } from "../database.js";
import type {
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
} from "../types/models.js";
import type { ExecutorResult, WorkflowContext } from "./types.js";
import type { NodeRunResult } from "./queue/types.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { taskRepository } from "../repositories/task.repository.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { edgeRepository } from "../repositories/edge.repository.js";
import { contextManager } from "./ContextManager.js";
import { edgeResolver } from "./EdgeResolver.js";
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { UserTaskExecutor } from "./executors/UserTaskExecutor.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import {
  ContextVariableScopeType,
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.USER]: new UserTaskExecutor(),
};

export const executionEngine = {
  runNode: async (
    instance: InstanceModel,
    node: NodeModel,
    context: WorkflowContext,
  ): Promise<{ task: TaskModel; taskExecution: TaskExecutionModel }> => {
    return db.transaction().execute(async (tx) => {
      const executor = executors[node.type];
      if (!executor) {
        throw new StateTransitionError(
          `No executor available for node type="${node.type}"`,
        );
      }

      const startedOn = new Date();
      let task = await taskRepository.insert(
        {
          instance_id: instance.id,
          node_id: node.id,
          status: TaskStatuses.IN_PROGRESS,
        },
        tx,
      );

      let taskExecution = await taskExecutionRepository.insert(
        {
          task_id: task.id,
          status: TaskStatuses.IN_PROGRESS,
          started_on: startedOn,
          input_variables: converterUtils.objectToJsonValue(
            contextManager.resolveForNode(context),
          ),
        },
        tx,
      );

      let result: ExecutorResult;
      try {
        result = await executor.execute(instance, node, context, tx);
      } catch (err) {
        result = {
          status: TaskStatuses.FAILED,
          outputVariables: {},
          error: err instanceof Error ? err.message : String(err),
        };
      }

      taskExecution = await taskExecutionRepository.updateById(
        taskExecution.id,
        {
          status: result.status,
          ended_on: new Date(),
          output_variables: converterUtils.objectToJsonValue(
            result.outputVariables,
          ),
        },
        tx,
      );

      task = await taskRepository.updateById(
        task.id,
        { status: result.status },
        tx,
      );

      if (node.type === NodeTypes.END) {
        instance = await instanceRepository.updateById(
          instance.id,
          {
            status: InstanceStatuses.COMPLETED,
            output_variables: converterUtils.objectToJsonValue(
              result.outputVariables,
            ),
            ended_on: new Date(),
          },
          tx,
        );
      }

      return { taskExecution, task };
    });
  },
};
