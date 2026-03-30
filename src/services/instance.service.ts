import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel, InstanceModel } from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { LogEventTypes, InstanceStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { InstanceListItem } from "../repositories/instance.repository.js";
import type { DB, InstanceStatus } from "../types/database.js";
import type { Transaction } from "kysely";
import { taskRepository } from "../repositories/task.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { eventLogService } from "./eventLog.service.js";
import { taskService } from "./task.service.js";
import { workflowService } from "./workflow.service.js";
import { getLogger } from "../logger.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { engineUtils } from "../utils/engine.utils.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

export const instanceService = {
  listAll: async (actorId: string): Promise<InstanceListItem[]> => {
    return instanceRepository.findAll(actorId);
  },

  listPaginated: async (
    actorId: string,
    limit: number,
    offset: number,
  ): Promise<{
    items: InstanceListItem[];
    total: number;
  }> => {
    return instanceRepository.findWithPagination(actorId, limit, offset);
  },

  createNew: async (data: CreateVersionInput, actor: ActorModel) => {
    const workflowVersion =
      await workflowVersionService.getActiveVersionByWorkflowId(
        data.workflowId,
      );
    if (!workflowVersion) {
      throw new NotFoundError("No active workflow version found");
    }

    const startNode = await nodeService.getByStartNodeByWorkflowVersionId(
      workflowVersion.id,
    );
    if (!startNode) {
      throw new DataIntegrityError(
        `No start node for workflow version id=${workflowVersion.id}`,
      );
    }

    const startContext = converterUtils.jsonValueToNodeInputSchema(
      startNode.input_schema,
    );
    const missingVariables = startContext.variableNames.filter(
      (variableName) => !(variableName in data.context),
    );

    if (missingVariables.length > 0) {
      throw new InvalidOperationError(
        "Missing context variables: " + missingVariables,
      );
    }

    let instance = await db.transaction().execute(async (transaction) => {
      const instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersion.id,
          status: data.autoAdvance
            ? InstanceStatuses.IN_PROGRESS
            : InstanceStatuses.PAUSED,
          auto_advance: data.autoAdvance,
          input_variables: converterUtils.objectToJsonValue(data.context),
          created_by: actor.id,
          started_on: new Date(),
          current_node_id: startNode.id,
        },
        transaction,
      );

      await eventLogService.createInstanceLog(
        instance.id,
        LogEventTypes.STARTED,
        undefined,
        actor.id,
        transaction,
      );

      return instance;
    });

    if (instance.auto_advance === false) {
      return { instance, workflowVersion };
    }

    try {
      await taskService.create(startNode, instance);
    } catch (err) {
      let message = "Unexpected error";

      if (err instanceof Error) {
        message = message;
      }
      instance = await instanceService.fail(instance.id, {
        message,
        error: err
      });
    }

    return { instance, workflowVersion };
  },

  get: async (instanceId: string, actorId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) {
      throw new NotFoundError("Instance");
    }

    const workflowVersion = await workflowVersionRepository.findById(
      instance.workflow_version_id,
    );
    if (!workflowVersion) {
      throw new DataIntegrityError(
        `Workflow version does not exist id = ${instance.workflow_version_id}`,
      );
    }

    const workflow_name = await workflowService.getWorkflowName(
      workflowVersion.workflow_id,
    );

    const task = await taskRepository.findLatestByInstanceId(instance.id);
    if (!task) {
      return { instance, workflowVersion, node: null, task: null };
    }

    const node = await nodeService.getById(task.node_id);
    if (!node) {
      throw new DataIntegrityError(`Node does not exist id = ${task.node_id}`);
    }

    return { instance, workflow_name, workflowVersion, node, task };
  },

  getById: async (instanceId: string): Promise<InstanceModel> => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) {
      throw new NotFoundError("Instance");
    }

    return instance;
  },

  advanceInstance: async (instanceId: string, actor: ActorModel) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance)
      throw new NotFoundError(`Instance id=${instanceId} not found`);

    if (instance.auto_advance) {
      throw new StateTransitionError(
        `Instance id=${instanceId} is in auto advance state`,
      );
    }

    if (
      !instance.auto_advance &&
      instance.status === InstanceStatuses.IN_PROGRESS
    ) {
      throw new StateTransitionError("Instance is in execution");
    }

    engineUtils.validateInstanceCanExecuteOrThrow(instance);

    if (!instance.current_node_id) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    const nextNode = await nodeService.getById(instance.current_node_id);
    if (!nextNode) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    await db.transaction().execute(async (transaction) => {
      await instanceRepository.updateById(
        instance.id,
        { status: InstanceStatuses.IN_PROGRESS },
        transaction,
      );
      await taskService.create(nextNode, instance, transaction);
    });
  },

  updateContext: async (
    instanceId: string,
    status: InstanceStatus,
    currentVariables: object,
    nextNodeId: string | null,
    transaction?: Transaction<DB>,
  ) => {
    return await instanceRepository.updateById(
      instanceId,
      {
        status: status,
        current_variables: converterUtils.objectToJsonValue(currentVariables),
        current_node_id: nextNodeId,
      },
      transaction,
    );
  },

  fail: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel> => {
    const logger = getLogger();
    logger.info(details, `[Instance] ${details.message}`);

    const executeCallback = async (transaction: Transaction<DB>) => {
      const [instance] = await Promise.all([
        instanceRepository.updateById(
          instanceId,
          {
            status: InstanceStatuses.FAILED,
            ended_on: new Date(),
            current_node_id: null,
          },
          transaction,
        ),

        eventLogService.createInstanceLog(
          instanceId,
          LogEventTypes.FAILED,
          details,
          undefined,
          transaction,
        ),
      ]);

      return instance;
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },

  complete: async (
    instanceId: string,
    outputVariables: object,
    transaction: Transaction<DB>,
    details?: LogDetailSchema,
  ): Promise<InstanceModel> => {
    const instance = await instanceRepository.updateById(
      instanceId,
      {
        status: InstanceStatuses.COMPLETED,
        output_variables: converterUtils.objectToJsonValue(outputVariables),
        ended_on: new Date(),
      },
      transaction,
    );

    await eventLogService.createInstanceLog(
      instanceId,
      LogEventTypes.COMPLETED,
      details,
      undefined,
      transaction,
    );

    return instance;
  },
};
