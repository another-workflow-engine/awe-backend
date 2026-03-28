import { converterUtils } from "../utils/converter.utils";
import type { DB, InstanceEventType } from "../types/database";
import type { Transaction } from "kysely";
import { instanceLogRepository } from "../repositories/instanceLog.repository";
import { InstanceEntityTypes } from "../types/enums";
import type { LogDetailSchema as LogDetailSchema } from "../types/instanceLog";

export const eventLogService = {
  createInstanceLog: async (
    instanceId: string,
    type: InstanceEventType,
    details?: LogDetailSchema,
    actorId?: string,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await instanceLogRepository.insert(
      {
        instance_id: instanceId,
        entity_type: InstanceEntityTypes.INSTANCE,
        entity_id: instanceId,
        event_type: type,
        details: details ? converterUtils.objectToJsonValue(details) : null,
        created_by: actorId ?? null,
      },
      transaction,
    );
  },

  createTaskLog: async (
    instanceId: string,
    taskId: string,
    type: InstanceEventType,
    details?: LogDetailSchema,
    actorId?: string,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await instanceLogRepository.insert(
      {
        instance_id: instanceId,
        entity_type: InstanceEntityTypes.TASK,
        entity_id: taskId,
        event_type: type,
        details: details ? converterUtils.objectToJsonValue(details) : null,
        created_by: actorId ?? null,
      },
      transaction,
    );
  },

  createTaskExecutionLog: async (
    instanceId: string,
    taskExecutionId: string,
    type: InstanceEventType,
    details?: LogDetailSchema,
    actorId?: string,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await instanceLogRepository.insert(
      {
        instance_id: instanceId,
        entity_type: InstanceEntityTypes.TASK_EXECUTION,
        entity_id: taskExecutionId,
        event_type: type,
        details: details ? converterUtils.objectToJsonValue(details) : null,
        created_by: actorId ?? null,
      },
      transaction,
    );
  },
};
