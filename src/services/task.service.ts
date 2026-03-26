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
  NodeTypes,
  TaskStatuses,
  TaskTransitionTypes,
} from "../types/enums.js";
import { queueService } from "./queue.service.js";
import { userTaskService } from "./userTask.service.js";
import type { ContextVariables } from "../types/engine.js";
import { transitionLogService } from "./transitionLog.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { contextUtils } from "../utils/context.utils.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import { userTaskExecutionRepository } from "../repositories/userTaskExecution.repository.js";

export const taskService = {
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
  ): Promise<TaskModel> => {
    const task = await db.transaction().execute(async (transaction) => {
      const task = await taskRepository.insert(
        {
          instance_id: instance.id,
          node_id: node.id,
          status: TaskStatuses.IN_PROGRESS,
        },
        transaction,
      );

      await transitionLogService.createTaskLog(
        { taskId: task.id, type: TaskTransitionTypes.CREATED },
        transaction,
      );

      return task;
    });

    try {
      if (node.type !== NodeTypes.USER) {
        await queueService.enqueue({
          taskId: task.id,
        });

        return task;
      }

      const executionContext = taskService.getTaskContext(instance, node);
      await userTaskService.create(node, task, executionContext);

      return task;
    } catch (err) {
      return taskService.fail(task.id, "Failed to create user task.", {});
    }
  },

  start: async (
    taskId: string,
    inputVariables: object,
  ): Promise<TaskExecutionModel | null> => {
    try {
      return await db.transaction().execute(async (transaction) => {
        const taskExecution = await taskExecutionRepository.insert(
          {
            task_id: taskId,
            status: TaskStatuses.IN_PROGRESS,
            input_variables: converterUtils.objectToJsonValue(inputVariables),
            started_on: new Date(),
          },
          transaction,
        );

        await transitionLogService.createTaskLog(
          { taskId: taskId, type: TaskTransitionTypes.STARTED },
          transaction,
        );

        return taskExecution;
      });
    } catch (err) {
      await taskService.fail(taskId, "", {});
      return null;
    }
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

  end: async (
    taskExecution: TaskExecutionModel,
    status: TaskStatus,
    outputVariables: object,
    transaction: Transaction<DB>,
  ): Promise<TaskModel> => {
    await taskExecutionRepository.updateById(
      taskExecution.id,
      {
        status,
        output_variables: converterUtils.objectToJsonValue(outputVariables),
        ended_on: new Date(),
      },
      transaction,
    );

    return await taskRepository.updateById(
      taskExecution.task_id,
      {
        status,
      },
      transaction,
    );
  },

  fail: async (
    taskId: string,
    message: string,
    details: object,
  ): Promise<TaskModel> => {
    return await db.transaction().execute(async (transaction) => {
      const [task] = await Promise.all([
        taskRepository.updateById(
          taskId,
          {
            status: TaskStatuses.FAILED,
          },
          transaction,
        ),

        transitionLogService.createTaskLog({
          type: TaskTransitionTypes.FAILED,
          taskId,
          message,
          details,
        }),
      ]);

      return task;
    });
  },
};
