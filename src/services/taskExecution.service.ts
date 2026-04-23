import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import type { Context } from "../types/engine.js";
import { LogEventTypes, TaskStatuses } from "../types/enums.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import type { DbTransaction, TaskExecutionModel } from "../types/models.js";
import { converterUtils } from "../utils/converter.utils.js";
import { openTransaction } from "../utils/database.utils.js";
import { eventLogService } from "./eventLog.service.js";

export const taskExecutionService = {
  getByTaskId: async (taskId: string) => {
    return await taskExecutionRepository.findByTaskId(taskId);
  },

  getByTaskIdWithUserTask: async (taskId: string) => {
    return await taskExecutionRepository.findByTaskIdWithUserTask(taskId);
  },

  getLatestUserTaskExecutionByTaskId: async (
    taskExecutionId: string,
    transaction?: DbTransaction,
  ): Promise<TaskExecutionModel | null> => {
    return await taskExecutionRepository.findLatestUserTaskExecutionByTaskExecutionId(
      taskExecutionId,
      transaction,
    );
  },

  create: async (
    instanceId: string,
    taskId: string,
    inputVariables: Context,
    transaction?: DbTransaction,
  ): Promise<TaskExecutionModel> => {
    const executeCallback = async (trx: DbTransaction) => {
      const taskExecution = await taskExecutionRepository.insert(
        {
          task_id: taskId,
          status: TaskStatuses.IN_PROGRESS,
          input_variables: converterUtils.objectToJsonValue(inputVariables),
          started_on: new Date(),
        },
        trx,
      );

      await eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecution.id,
        LogEventTypes.STARTED,
        undefined,
        undefined,
        trx,
      );

      return taskExecution;
    };

    return transaction
      ? await executeCallback(transaction)
      : await openTransaction(executeCallback);
  },

  complete: async (
    instanceId: string,
    taskExecutionId: string,
    outputVariables: object,
    transaction: DbTransaction,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.COMPLETED,
          output_variables: converterUtils.objectToJsonValue(outputVariables),
          ended_on: new Date(),
        },
        transaction,
      ),
      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.COMPLETED,
        undefined,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },

  fail: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    transaction: DbTransaction,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.FAILED,
          ended_on: new Date(),
        },
        transaction,
      ),
      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.FAILED,
        details,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },

  terminate: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    transaction: DbTransaction,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.TERMINATED,
          ended_on: new Date(),
        },
        transaction,
      ),
      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.TERMINATED,
        details,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },
};
