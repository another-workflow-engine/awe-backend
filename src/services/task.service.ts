import { taskRepository } from "../repositories/task.repository.js";
import type { DB, TaskExecution, TaskStatus } from "../types/database.js";
import type {
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type { Transaction } from "kysely";
import { instanceRepository } from "../repositories/instance.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { db } from "../database.js";
import {
  LogEventTypes,
  NodeTypes,
  TaskStatuses,
  TaskTransitionTypes,
} from "../types/enums.js";
import { queueService } from "./queue.service.js";
import { userTaskService } from "./userTask.service.js";
import type { ContextVariables } from "../types/engine.js";
import { eventLogService } from "./eventLog.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { contextUtils } from "../utils/context.utils.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import { getLogger } from "../logger.js";
import type { LogDetailSchema } from "../types/instanceLog.js";

export const taskService = {
  getById: async (taskId: string): Promise<TaskModel> => {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError("Task");
    }

    return task;
  },

  getAllTaskDetails: async (
    taskId: string,
  ): Promise<{ instance: InstanceModel; node: NodeModel; task: TaskModel }> => {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError("task");
    }

    const [instance, node] = await Promise.all([
      instanceRepository.findById(task.instance_id),
      nodeRepository.findById(task.node_id),
    ]);

    if (!instance) {
      throw new NotFoundError("instance");
    }
    if (!node) {
      throw new NotFoundError("node");
    }

    return { instance, node, task };
  },

  create: async (
    node: NodeModel,
    instance: InstanceModel,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    const logger = getLogger();

    const executeCallback = async (transaction: Transaction<DB>) => {
      const task = await taskRepository.insert(
        {
          instance_id: instance.id,
          node_id: node.id,
          status: TaskStatuses.IN_PROGRESS,
        },
        transaction,
      );

      await eventLogService.createTaskLog(
        instance.id,
        task.id,
        LogEventTypes.STARTED,
        undefined,
        undefined,
        transaction,
      );

      return task;
    };

    const task = transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);

    if (node.type !== NodeTypes.USER) {
      return await queueService
        .enqueue({
          instanceId: instance.id,
          taskId: task.id,
          nodeId: node.id,
        })
        .then(() => task)
        .catch(async (err: Error) => {
          return await taskService.fail(
            instance.id,
            task.id,
            {
              message: "Failed to enqueue task",
              error: err,
            },
            err,
          );
        });
    }

    let executionContext;
    let taskExecution;

    try {
      executionContext = taskService.getTaskContext(instance, node);
      taskExecution = await taskService.startNewExecution(
        task,
        executionContext,
      );
    } catch (err) {
      let message = "Unknown error";
      let error;

      if (err instanceof Error) {
        message = err.message;
        error = err;
      }

      return await taskService.fail(
        instance.id,
        task.id,
        {
          message,
        },
        error,
      );
    }

    return await userTaskService
      .create(node, taskExecution, executionContext)
      .then(() => task)
      .catch(async (err: Error) => {
        return await taskService.fail(
          instance.id,
          task.id,
          { message: err.message },
          err,
        );
      });
  },

  startNewExecution: async (
    task: TaskModel,
    inputVariables: ContextVariables,
  ): Promise<TaskExecutionModel> => {
    return await db.transaction().execute(async (transaction) => {
      const taskExecution = await taskExecutionRepository.insert(
        {
          task_id: task.id,
          status: TaskStatuses.IN_PROGRESS,
          input_variables: converterUtils.objectToJsonValue(inputVariables),
          started_on: new Date(),
        },
        transaction,
      );

      await eventLogService.createTaskExecutionLog(
        task.instance_id,
        taskExecution.id,
        LogEventTypes.STARTED,
        undefined,
        undefined,
        transaction,
      );

      return taskExecution;
    });
  },

  getTaskContext: (instance: InstanceModel, node: NodeModel) => {
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

    return contextUtils.getTaskContext(instanceContext, nodeInputSchema);
  },

  complete: async (
    task: TaskModel,
    transaction: Transaction<DB>,
  ): Promise<TaskModel> => {
    const [updatedTask] = await Promise.all([
      taskRepository.updateById(
        task.id,
        {
          status: TaskStatuses.COMPLETED,
        },
        transaction,
      ),

      eventLogService.createTaskLog(
        task.instance_id,
        task.id,
        LogEventTypes.COMPLETED,
        undefined,
        undefined,
        transaction,
      ),
    ]);
    return updatedTask;
  },

  fail: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    error?: Error,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    const logger = getLogger();
    logger.info({ details, error }, `[Task] ${details.message}`);

    const executeCallback = async (transaction: Transaction<DB>) => {
      const [task] = await Promise.all([
        taskRepository.updateById(
          taskId,
          {
            status: TaskStatuses.FAILED,
          },
          transaction,
        ),

        eventLogService.createTaskLog(
          instanceId,
          taskId,
          LogEventTypes.FAILED,
          details,
          undefined,
          transaction,
        ),
      ]);

      return task;
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },
};
