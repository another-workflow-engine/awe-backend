import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { nodeService } from "./node.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { LogEventTypes, InstanceStatuses } from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import type {
  EnvironmentType,
  InstanceEventType,
  InstanceStatus,
} from "../types/database.js";
import { taskRepository } from "../repositories/task.repository.js";
import { eventLogService } from "./eventLog.service.js";
import { taskService } from "./task.service.js";
import { getLogger } from "../logger.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { engineUtils } from "../utils/engine.utils.js";
import { ContextSchema } from "../schemas/context.schema.js";
import { openTransaction } from "../utils/database.utils.js";
import { environmentUtils } from "../utils/environment.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import type { InstanceDetail, InstanceListItem } from "../types/instance.js";
import { buildExecutionSequence } from "../utils/nodePath.utils.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import type { ExecutionSequenceResponse } from "../types/nodePath.js";
import type { Context } from "../types/engine.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

type UpdateInstanceStatusParams = {
  instanceId: string;
  status: InstanceStatus;
  outputVariables?: Record<string, unknown>;
  currentVariables?: Record<string, unknown>;
  details?: LogDetailSchema | undefined;
  actorId?: string | undefined;
  transaction?: DbTransaction | undefined;
};

const instanceStatusToEventMap: Record<InstanceStatus, InstanceEventType> = {
  in_progress: LogEventTypes.RESUMED,
  paused: LogEventTypes.PAUSED,
  completed: LogEventTypes.COMPLETED,
  failed: LogEventTypes.FAILED,
  terminated: LogEventTypes.TERMINATED,
};

const nonTerminalStatus: InstanceStatus[] = [
  InstanceStatuses.IN_PROGRESS,
  InstanceStatuses.PAUSED,
];

async function updateInstanceStatus(
  params: UpdateInstanceStatusParams,
): Promise<InstanceModel> {
  const isTerminalUpdate = !nonTerminalStatus.includes(params.status);

  const executeCallback = async (transaction: DbTransaction) => {
    const [instance] = await Promise.all([
      instanceRepository.updateById(
        params.instanceId,
        {
          status: params.status,
          control_signal: null,
          ...(params.currentVariables !== undefined && {
            current_variables: converterUtils.objectToJsonValue(
              params.currentVariables,
            ),
          }),

          ...(isTerminalUpdate && {
            ended_on: new Date(),
            current_node_id: null,
            output_variables: params.outputVariables
              ? converterUtils.objectToJsonValue(params.outputVariables)
              : {},
          }),
        },
        transaction,
      ),

      eventLogService.createInstanceLog({
        instanceId: params.instanceId,
        eventType: instanceStatusToEventMap[params.status],
        details: params.details,
        actorId: params.actorId,
        transaction: params.transaction,
      }),
    ]);

    return instance;
  };

  const instance = params.transaction
    ? await executeCallback(params.transaction)
    : await openTransaction(executeCallback);

  getLogger().info(
    { instanceId: params.instanceId, details: params.details },
    `Instance status changed to ${params.status}`,
  );

  return instance;
}

export function getFormattedDetailOutput(params: {
  workflow: WorkflowModel;
  workflowVersion: WorkflowVersionModel;
  instance: InstanceModel;
  task?: TaskModel;
  node?: NodeModel;
  taskExecution?: TaskExecutionModel | undefined;
}): InstanceDetail {
  const { workflow, workflowVersion, instance, task, node, taskExecution } =
    params;
  if (!workflowVersion.version) {
    throw new DataIntegrityError("Workflow version is null");
  }

  return {
    id: instance.id,

    startedAt: instance.created_on,
    endedAt: instance.ended_on,

    status: instance.status,
    controlSignal: instance.control_signal,
    autoAdvance: instance.auto_advance,

    inputVariables: converterUtils.jsonValueToObject(instance.input_variables),
    currentVariables: converterUtils.parseOrThrow(
      ContextSchema,
      instance.current_variables,
    ),
    outputVariables: converterUtils.jsonValueToObject(
      instance.output_variables,
    ),

    workflow: {
      id: workflow.id,
      name: workflow.name,

      versionId: workflowVersion.id,
      version: workflowVersion.version,
    },

    currentTask:
      !task || !node
        ? null
        : {
            id: task.id,
            status: task.status,
            startedAt: task.created_on,

            executionId: taskExecution?.id ?? null,

            nodeId: node.client_id,
            type: node.type,
            name: node.name,
          },
  };
}

export const instanceService = {
  getPaginated: async (
    data: {
      limit: number;
      offset: number;
      selectedEnvironments: EnvironmentType[];
    },
    environments: EnvironmentModel[],
  ): Promise<{
    items: InstanceListItem[];
    total: number;
  }> => {
    const filteredEnvironments = environmentUtils.getFilteredEnvironments(
      environments,
      data.selectedEnvironments,
    );

    return instanceRepository.findWithPagination(
      filteredEnvironments.map((env) => env.id),
      data.limit,
      data.offset,
    );
  },

  get: async (instanceId: string, environments: EnvironmentModel[]) => {
    const [instanceModels, taskModels] = await Promise.all([
      instanceRepository.findByIdAndEnvironmentIdsWithRelations(
        instanceId,
        environmentUtils.getEnvironmentIds(environments),
      ),
      taskRepository.findLatestByInstanceIdWithRelations(instanceId),
    ]);

    if (!instanceModels) {
      throw new NotFoundError("Instance");
    }

    return getFormattedDetailOutput({ ...instanceModels, ...taskModels });
  },

  getLockedInProgressOrPausedRelations: async (
    instanceId: string,
    transaction: DbTransaction,
  ) => {
    return await instanceRepository.getLockedInProgressOrPausedRelationsById(
      instanceId,
      transaction,
    );
  },

  createNew: async (
    data: CreateVersionInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const environmentIds = environments.map((env) => env.id);

    const models =
      await workflowVersionService.getActiveVersionByWorkflowIdWithRelations(
        data.workflowId,
      );
    if (!models || !environmentIds.includes(models.workflow.environment_id)) {
      throw new NotFoundError("Active workflow version");
    }

    const { workflowVersion, startNode, workflow } = models;

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

    const { instance, task, taskExecution } = await openTransaction(
      async (transaction) => {
        const instance = await instanceRepository.insert(
          {
            workflow_version_id: workflowVersion.id,
            status: data.autoAdvance
              ? InstanceStatuses.IN_PROGRESS
              : InstanceStatuses.PAUSED,
            auto_advance: data.autoAdvance,
            input_variables: converterUtils.objectToJsonValue(data.context),
            created_by: actor.id,
            current_node_id: startNode.id,
          },
          transaction,
        );

        await eventLogService.createInstanceLog({
          instanceId: instance.id,
          eventType: LogEventTypes.STARTED,
          actorId: actor.id,
          transaction: transaction,
        });

        const { task, taskExecution } = await taskService.create({
          instance,
          node: startNode,
          transaction,
        });
        return { instance, task, taskExecution };
      },
    );

    return getFormattedDetailOutput({
      workflow,
      workflowVersion,
      instance,
      task,
      node: startNode,
      taskExecution,
    });
  },

  resume: async (
    instanceId: string,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const models =
      await instanceRepository.findByIdAndEnvironmentIdsWithRelations(
        instanceId,
        environments.map((env) => env.id),
      );
    if (!models) {
      throw new NotFoundError(`Instance`);
    }

    const { instance, workflow, workflowVersion } = models;

    engineUtils.validateInstanceHasNotEndedOrThrow(instance.status);

    if (
      instance.status !== InstanceStatuses.PAUSED ||
      instance.control_signal !== null
    ) {
      throw new StateTransitionError(
        `Instance id=${instanceId} cannot be resumed`,
      );
    }

    const nextNode = instance.current_node_id
      ? await nodeService.getById(instance.current_node_id)
      : undefined;
    if (!nextNode) {
      throw new StateTransitionError(
        `Instance id=${instanceId} has no next node.`,
      );
    }

    const { updatedInstance, task, taskExecution } = await openTransaction(
      async (transaction) => {
        const updatedInstance = await updateInstanceStatus({
          instanceId: instance.id,
          status: InstanceStatuses.IN_PROGRESS,
          actorId: actor.id,
          transaction,
        });
        const { task, taskExecution } = await taskService.resume(
          nextNode,
          updatedInstance,
          transaction,
        );
        return { updatedInstance, task, taskExecution };
      },
    );

    return getFormattedDetailOutput({
      instance: updatedInstance,
      task,
      taskExecution,
      node: nextNode,
      workflow,
      workflowVersion,
    });
  },

  fail: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction: DbTransaction,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.FAILED,
      details,
      transaction,
    });
  },

  terminate: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.TERMINATED,
      details,
      transaction,
    });
  },

  complete: async (
    instanceId: string,
    outputVariables: Record<string, unknown>,
    details?: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.COMPLETED,
      outputVariables,
      details,
      transaction,
    });
  },

  pause: async (
    instanceId: string,
    details: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<InstanceModel> => {
    return await updateInstanceStatus({
      instanceId,
      status: InstanceStatuses.PAUSED,
      details,
      transaction,
    });
  },

  updateContext: async (
    instanceId: string,
    status: InstanceStatus,
    currentVariables: object,
    nextNodeId: string | null,
    transaction: DbTransaction,
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

  updateContextForRetry: async (
    instance: InstanceModel,
    patchContext: Record<string, unknown>,
    actor: ActorModel,
    transaction: DbTransaction,
  ) => {
    if (
      instance.status !== InstanceStatuses.FAILED &&
      instance.status !== InstanceStatuses.TERMINATED
    ) {
      throw new StateTransitionError(
        `Instance has not failed or terminated. Status is ${instance.status}`,
      );
    }

    const instanceContext = instance.current_variables
      ? converterUtils.parseOrThrow(ContextSchema, instance.current_variables)
      : {
          constants: converterUtils.jsonValueToObject(instance.input_variables),
          fetchables: {},
          urls: {},
          secrets: {},
        };

    const mergedContext: Context = {
      ...instanceContext,
      constants: {
        ...instanceContext.constants,
        ...(patchContext ?? {}),
      },
    };

    return await updateInstanceStatus({
      instanceId: instance.id,
      status: InstanceStatuses.IN_PROGRESS,
      actorId: actor.id,
      currentVariables: mergedContext,
      details: { message: "Retry task" },
      transaction,
    });
  },

  getExecutionSequence: async (
    instanceId: string,
    environments: EnvironmentModel[],
  ): Promise<ExecutionSequenceResponse> => {
    const executionGraphData =
      await taskExecutionRepository.findExecutionSequenceDataByInstanceId(
        instanceId,
      );

    const { nodes, connections, executions } = executionGraphData;

    return {
      executionSequence:
        nodes.length === 0
          ? []
          : buildExecutionSequence(nodes, connections, executions),
    };
  },
};
