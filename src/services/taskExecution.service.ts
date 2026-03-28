import type { Transaction } from "kysely";
import { db } from "../database";
import { taskExecutionRepository } from "../repositories/taskExecution.repository";
import type { ContextVariables } from "../types/engine";
import { LogEventTypes, TaskStatuses } from "../types/enums";
import type { LogDetailSchema } from "../types/instanceLog";
import type { TaskExecutionModel, TaskModel } from "../types/models";
import { converterUtils } from "../utils/converter.utils";
import { eventLogService } from "./eventLog.service";
import type { DB } from "../types/database";

export const taskExecutionService = {
  create: async (
    task: TaskModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const executeCallback = async (transaction: Transaction<DB>) => {
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
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },

  complete: async (
    instanceId: string,
    taskExecutionId: string,
    outputVariables: object,
  ): Promise<TaskExecutionModel> => {
    return await db.transaction().execute(async (transaction) => {
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
    });
  },

  fail: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    error?: Error,
  ): Promise<TaskExecutionModel> => {
    return await db.transaction().execute(async (transaction) => {
      const [taskExecution] = await Promise.all([
        taskExecutionRepository.updateById(
          taskExecutionId,
          {
            status: TaskStatuses.FAILED,
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
    });
  },
};
