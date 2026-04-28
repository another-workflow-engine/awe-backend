import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceEventType } from "../types/database.js";
import { instanceLogRepository } from "../repositories/instanceLog.repository.js";
import { InstanceEntityTypes } from "../types/enums.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import type { DbTransaction, EnvironmentModel } from "../types/models.js";
import { environmentUtils } from "../utils/environment.utils.js";

export type CreateInstanceLogParams = {
  instanceId: string;
  eventType: InstanceEventType;
  details?: LogDetailSchema | undefined;
  actorId?: string | undefined;
  transaction?: DbTransaction | undefined;
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
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
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

  getInstanceAudit: async (
    instanceId: string,
    environments: EnvironmentModel[],
  ) => {
    return await instanceLogRepository.getInstanceAudit(
      instanceId,
      environmentUtils.getEnvironmentIds(environments),
    );
  },
};
