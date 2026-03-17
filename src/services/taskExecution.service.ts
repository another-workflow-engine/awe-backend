import type { Transaction } from "kysely";
import { taskExecutionRepository } from "../repositories/taskExecution.repository";
import type { DB, TaskStatus } from "../types/database";
import { converterUtils } from "../utils/converter.utils";
import type { TaskExecutionModel } from "../types/models";

export const taskExecutionService = {
  startNew: async (
    taskId: string,
    status: TaskStatus,
    inputVariables: object,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    return taskExecutionRepository.insert(
      {
        task_id: taskId,
        status,
        input_variables: converterUtils.objectToJsonValue(inputVariables),
        started_on: new Date(),
      },
      transaction,
    );
  },

  end: async (
    taskId: string,
    status: TaskStatus,
    outputVariables: object,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    return taskExecutionRepository.updateById(
      taskId,
      {
        status,
        output_variables: converterUtils.objectToJsonValue(outputVariables),
        ended_on: new Date(),
      },
      transaction,
    );
  },

  updateStatus: async (
    taskId: string,
    status: TaskStatus,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    return taskExecutionRepository.updateById(
      taskId,
      {
        status,
      },
      transaction,
    );
  },
};
