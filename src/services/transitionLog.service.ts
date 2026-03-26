import { instanceTransitionLogRepository } from "../repositories/instanceTransitionLog.repository";
import { converterUtils } from "../utils/converter.utils";
import type {
  DB,
  InstanceTransitionType,
  TaskTransitionType,
} from "../types/database";
import type { Transaction } from "kysely";
import { taskTransitionLogRepository } from "../repositories/taskTransitionLog.repository";

export interface InstanceLogData {
  instanceId: string;
  type: InstanceTransitionType;
  message?: string;
  details?: object;
  actorId?: string;
}

export interface TaskLogData {
  taskId: string;
  type: TaskTransitionType;
  message?: string;
  details?: object;
  actorId?: string;
}

export const transitionLogService = {
  createInstanceLog: async (
    data: InstanceLogData,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await instanceTransitionLogRepository.insert(
      {
        instance_id: data.instanceId,
        transition_type: data.type,
        message: data.message ?? null,
        details: converterUtils.objectToJsonValue(data.details ?? {}),
        created_by: data.actorId ?? null,
      },
      transaction,
    );
  },

  createTaskLog: async (
    data: TaskLogData,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await taskTransitionLogRepository.insert(
      {
        task_id: data.taskId,
        transition_type: data.type,
        message: data.message ?? null,
        details: converterUtils.objectToJsonValue(data.details ?? {}),
        created_by: data.actorId ?? null,
      },
      transaction,
    );
  },
};
