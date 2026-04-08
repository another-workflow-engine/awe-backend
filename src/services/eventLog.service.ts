import { converterUtils } from "../utils/converter.utils.js";
import type { DB, InstanceEventType } from "../types/database.js";
import type { Transaction } from "kysely";
import { instanceLogRepository } from "../repositories/instanceLog.repository.js";
import { InstanceEntityTypes } from "../types/enums.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import type { ActorModel } from "../types/models.js";

export type CreateInstanceLogParams = {
  instanceId: string;
  eventType: InstanceEventType;
  details?: LogDetailSchema | undefined;
  actorId?: string | undefined;
  transaction?: Transaction<DB> | undefined;
};

export const eventLogService = {
  createInstanceLog: async (params: CreateInstanceLogParams): Promise<void> => {
    await instanceLogRepository.insert(
      {
        instance_id: params.instanceId,
        entity_type: InstanceEntityTypes.INSTANCE,
        entity_id: params.instanceId,
        event_type: params.eventType,
        details: params.details
          ? converterUtils.objectToJsonValue(params.details)
          : null,
        created_by: params.actorId ?? null,
      },
      params.transaction,
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

  getLogsByInstanceId: async (
    instanceId: string,
    filters: {
      entityTypes?: string[];
      createdBy?: string;
      eventTypes?: string[];
    } = {},
    sortOrder: "asc" | "desc" = "asc",
  ) => {
    return await instanceLogRepository.getInstanceHistory(
      instanceId,
      filters as any,
      sortOrder,
    );
  },

  getInstanceAudit: async (instanceId: string, actor: ActorModel) => {
    return await instanceLogRepository.getInstanceAudit(instanceId, actor);
  },
};
