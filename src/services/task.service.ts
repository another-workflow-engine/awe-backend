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
import type { InputVariables } from "../types/engine.js";
import { eventLogService } from "./eventLog.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { contextUtils } from "../utils/context.utils.js";
import { getLogger } from "../logger.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { engineUtils } from "../utils/engine.utils.js";
import { EngineError } from "../errors/EngineError.js";
import { taskExecutionService } from "./taskExecution.service.js";
import { NodeSchema } from "../schemas/node.schema.js";
import { convertToMilliseconds } from "../utils/converter.utils.js";

export const taskService = {
  getByIdOrThrow: async (taskId: string): Promise<TaskModel> => {
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

      const nodeSchema = converterUtils.parseOrThrow(NodeSchema, node);
      const attempts = {
        type: "fixed",
        delay: 1000,
        max: 1,
      };

      if (
        nodeSchema.type === NodeTypes.SERVICE ||
        nodeSchema.type === NodeTypes.SCRIPT
      ) {
        attempts.delay = convertToMilliseconds(
          nodeSchema.configuration.backoff.delay,
          nodeSchema.configuration.backoff.unit,
        );
        attempts.type = nodeSchema.configuration.backoff.type;
        attempts.max = nodeSchema.configuration.maxAttempts;
      }

      if (node.type !== NodeTypes.USER) {
        await queueService
          .enqueue(
            {
              instanceId: instance.id,
              taskId: task.id,
              nodeId: node.id,
            },
            attempts.max,
            attempts.type,
            attempts.delay,
          )
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
          instance.id,
          task.id,
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
    let instanceContext: InputVariables;

    if (node.type === NodeTypes.START) {
      instanceContext = {
        constants: converterUtils.jsonValueToObject(instance.input_variables),
        fetchables: {},
        urls: {},
      };
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

  getInProgressByInstanceId: async (instanceId: string) => {
    return await taskRepository.findInProgressByInstanceIdWithRelations(
      instanceId,
    );
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
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    const logger = getLogger();
    logger.info({ details }, `Task id=${taskId} failed`);

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

  terminate: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    const logger = getLogger();
    logger.info({ details }, `Task id=${taskId} terminated`);

    const executeCallback = async (transaction: Transaction<DB>) => {
      const [task] = await Promise.all([
        taskRepository.updateById(
          taskId,
          {
            status: TaskStatuses.TERMINATED,
          },
          transaction,
        ),

        eventLogService.createTaskLog(
          instanceId,
          taskId,
          LogEventTypes.TERMINATED,
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

  pause: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    const logger = getLogger();
    logger.info({ details }, `Task id=${taskId} paused`);

    const executeCallback = async (transaction: Transaction<DB>) => {
      const [task] = await Promise.all([
        taskRepository.updateById(
          taskId,
          {
            status: TaskStatuses.PAUSED,
          },
          transaction,
        ),

        eventLogService.createTaskLog(
          instanceId,
          taskId,
          LogEventTypes.PAUSED,
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
