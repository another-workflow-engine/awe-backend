import { taskRepository } from "../repositories/task.repository.js";
import type { DB } from "../types/database.js";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type { Transaction } from "kysely";
import { instanceRepository } from "../repositories/instance.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { db } from "../database.js";
import { LogEventTypes, NodeTypes, TaskStatuses } from "../types/enums.js";
import { queueService } from "./queue.service.js";
import { userTaskService } from "./userTaskExecution.service.js";
import type { ContextVariables } from "../types/engine.js";
import { eventLogService } from "./eventLog.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { contextUtils } from "../utils/context.utils.js";
import { getLogger } from "../logger.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { engineUtils } from "../utils/engine.utils.js";
import { EngineError } from "../errors/EngineError.js";
import { taskExecutionService } from "./taskExecution.service.js";

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

      if (node.type !== NodeTypes.USER) {
        await queueService
          .enqueue({
            instanceId: instance.id,
            taskId: task.id,
            nodeId: node.id,
          })
          .then(() => task)
          .catch(async (err: Error) => {
            await engineUtils.onExecutionFailure(err, task);
            throw new EngineError("Unable to create task.");
          });

        return task;
      }

      try {
        const executionContext = taskService.getTaskContext(instance, node);

        const taskExecution = await taskExecutionService.create(
          task,
          executionContext,
          transaction,
        );

        await userTaskService
          .create(node, taskExecution, executionContext, transaction)
          .then(() => task)
          .catch(async (err: Error) => {
            await engineUtils.onExecutionFailure(err, task);
            throw new EngineError("Unable to create task.");
          });
      } catch (err) {
        console.log(err);
        await engineUtils.onExecutionFailure(err, task);
        throw new EngineError("Unable to create task.");
      }
      getLogger().info("Created user task");

      return task;
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
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
