import { instanceRepository } from "../repositories/instance.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { ValidationError } from "../errors/ValidationError.js";
import { converterUtils } from "../utils/converter.utils.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import {
  TaskStatuses,
  InstanceStatuses,
  FeelDataType,
} from "../types/enums.js";
import { edgeService } from "./edge.services.js";
import type { Context, ExecutorResult, QueueJobData } from "../types/engine.js";
import { validateUserTaskInput } from "../utils/inputValidator.utils.js";
import { userTaskExecutionRepository } from "../repositories/userTaskExecution.repository.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
  TaskExecutionModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { contextUtils } from "../utils/context.utils.js";
import { environmentService } from "./environment.services.js";
import { taskService } from "./task.service.js";
import { taskExecutionService } from "./taskExecution.service.js";
import { engineUtils } from "../utils/engine.utils.js";
import { ContextSchema } from "../schemas/context.schema.js";
import type { UserNodeConfiguration } from "../types/workflow.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { environmentUtils } from "../utils/environment.utils.js";
import type { PendingUserTaskListInput } from "../schemas/task.schema.js";
import { paginationUtils } from "../utils/pagination.utils.js";
import type {
  PendingUserTaskListItem,
  UserTaskDetail,
  UserTaskResponseData,
} from "../types/task.js";

export const userTaskService = {
  getPendingPaginated: async (
    data: PendingUserTaskListInput,
    environments: EnvironmentModel[],
  ) => {
    const environmentIds = environmentUtils.getFilteredEnvironmentIds(
      environments,
      data.environment,
    );

    const { items, total } =
      await userTaskExecutionRepository.findByEnvironmentIdsAndStatusPaginated({
        environmentIds,
        status: TaskStatuses.IN_PROGRESS,
        assignee: data.assignee,
        limit: data.limit,
        offset: paginationUtils.getOffset(data.page, data.limit),
      });

    const pagination = paginationUtils.getPaginationResponse(
      total,
      data.page,
      data.limit,
    );

    return {
      userTasks: items,
      pagination,
    };
  },

  get: async (
    id: string,
    environments: EnvironmentModel[],
  ): Promise<UserTaskDetail> => {
    const environmentIds = environmentUtils.getEnvironmentIds(environments);

    const result =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdsWithRelations(
        id,
        environmentIds,
      );

    if (!result) {
      throw new NotFoundError("User task");
    }

    const {
      userTaskExecution,
      taskExecution,
      node,
      task,
      instance,
      workflow,
      workflowVersion,
    } = result;

    const nodeContext = converterUtils.parseOrThrow(
      ContextSchema,
      taskExecution.input_variables,
    );
    const evaluatedContext = await contextUtils.evaluateContext(nodeContext);

    const configuration = converterUtils.parseOrThrow(
      UserNodeConfigurationSchema,
      node.configuration,
    );

    const requestData: Record<string, unknown> = {};
    configuration.requestMap.forEach((data) => {
      requestData[data.label] = contextUtils.getFeelEvaluatedValue(
        data.valueExpression,
        evaluatedContext,
      );
    });

    const responseData: UserTaskResponseData[] = configuration.responseMap.map(
      (data) => {
        return {
          fieldId: data.fieldId,
          label: data.label,
          dataType: data.type,
          required: data.required,
          defaultValue: data.defaultValue,
          uiType: data.uiType,
          options: data.options?.map((option) => {
            return {
              label: option.label,
              value: contextUtils.getFeelEvaluatedValue(
                option.valueExpression,
                evaluatedContext,
              ),
            };
          }),
        };
      },
    );

    return {
      id: userTaskExecution.task_execution_id,
      title: userTaskExecution.title,
      assignee: userTaskExecution.assignee,
      startedAt: taskExecution.created_on,
      endedAt: taskExecution.ended_on,
      status: taskExecution.status,
      requestData,
      responseData,
      instanceId: instance.id,
      taskId: task.id,
      workflow: {
        id: workflow.id,
        versionId: workflowVersion.id,
        version: workflowVersion.version,
        name: workflow.name,
      },
      nodeId: node.client_id,
    };
  },

  completeUserTask: async (
    id: string,
    userInput: Record<string, unknown>,
    environments: EnvironmentModel[],
  ): Promise<UserTaskDetail> => {
    const environmentIds = environmentUtils.getEnvironmentIds(environments);

    const models =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdsWithRelations(
        id,
        environmentIds,
      );

    if (!models) {
      throw new NotFoundError("User task");
    }

    const { userTaskExecution, taskExecution, node, task, instance } = models;

    if (taskExecution.status !== TaskStatuses.IN_PROGRESS) {
      throw new StateTransitionError(
        `Task execution id=${userTaskExecution.task_execution_id} is not awaiting user input`,
      );
    }

    if (instance.status !== InstanceStatuses.IN_PROGRESS) {
      throw new StateTransitionError(
        `Instance id=${instance.id} is not in progress`,
      );
    }

    const configuration = converterUtils.parseOrThrow(
      UserNodeConfigurationSchema,
      node.configuration,
    );

    const executionContext = converterUtils.parseOrThrow(
      ContextSchema,
      taskExecution.input_variables,
    );

    const validationErrors = await validateUserTaskInput(
      userInput,
      configuration.responseMap,
      executionContext,
    );

    if (validationErrors.length > 0) {
      throw new ValidationError(
        "Invalid user input",
        validationErrors.map((e) => ({
          field: e.field,
          message: e.error,
        })),
      );
    }

    const outputVariables: Record<string, unknown> = {};
    for (const field of configuration.responseMap) {
      outputVariables[field.contextVariableName] = userInput[field.fieldId];
    }

    const [nextNodeId] = await edgeService.getDestinationNodeIdsBySourceNodeId(
      node.id,
    );

    const executionResult: ExecutorResult = {
      executionId: taskExecution.id,
      status: TaskStatuses.COMPLETED,
      outputVariables: outputVariables,
      nextNodeId: nextNodeId ?? null,
    };

    await engineUtils.completeTask({
      jobData: {
        instanceId: task.instance_id,
        taskId: task.id,
        nodeId: task.node_id,
      },
      executionResult,
    });

    const updatedTaskExecution =
      await taskExecutionService.getLatestUserTaskExecutionByTaskId(
        taskExecution.id,
      );

    if (!updatedTaskExecution) {
      throw new DataIntegrityError(
        `Unable to retrieve completed user task execution for task_execution_id=${taskExecution.id}`,
      );
    }

    return await userTaskService.get(id, environments);
  },

  create: async (params: {
    jobData: QueueJobData;
    nodeConfiguration: UserNodeConfiguration;
    taskContext: Context;
    transaction: DbTransaction;
  }) => {
    const { jobData, nodeConfiguration, taskContext, transaction } = params;
    const { instanceId, taskId } = jobData;

    const taskExecution = await taskExecutionService.create(
      instanceId,
      taskId,
      taskContext,
      transaction,
    );

    const assignee = nodeConfiguration.assignee
      ? contextUtils.getFeelEvaluatedValue(
          nodeConfiguration.assignee,
          await contextUtils.evaluateContext(taskContext),
          FeelDataType.STRING,
        )
      : null;
    const title = nodeConfiguration.title ?? null;

    const userTaskExecution = await userTaskExecutionRepository.insert(
      {
        task_execution_id: taskExecution.id,
        assignee,
        title,
      },
      transaction,
    );

    return { taskExecution, userTaskExecution };
  },
};
