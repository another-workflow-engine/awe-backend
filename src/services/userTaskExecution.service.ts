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
  TaskExecutionModel,
  UserNodeModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { contextUtils } from "../utils/context.utils.js";
import { environmentService } from "./environment.services.js";
import type { PendingUserTaskList } from "../types/userTask.js";
import { taskService } from "./task.service.js";
import { taskExecutionService } from "./taskExecution.service.js";
import { engineUtils } from "../utils/engine.utils.js";
import { Transaction } from "kysely";
import type { DB } from "../types/database.js";
import { db } from "../database.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { ContextSchema } from "../schemas/context.schema.js";
import type { UserNodeConfiguration } from "../types/workflow.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";

export const userTaskService = {
  create: async (params: {
    jobData: QueueJobData;
    nodeConfiguration: UserNodeConfiguration;
    taskContext: Context;
    transaction: Transaction<DB>;
  }): Promise<UserTaskExecutionModel> => {
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

    return await userTaskExecutionRepository.insert(
      {
        task_execution_id: taskExecution.id,
        assignee,
        title,
      },
      transaction,
    );
  },

  getPending: async (actor: ActorModel): Promise<PendingUserTaskList[]> => {
    const environments = await environmentService.getAllByActor(actor);
    return await userTaskExecutionRepository.findByEnvironmentIdsAndStatus(
      environments.map((environment) => environment.id),
      TaskStatuses.IN_PROGRESS,
    );
  },

  getPendingPaginated: async (
    actor: ActorModel,
    environmentIds: string[],
    limit: number,
    offset: number,
  ): Promise<{
    items: PendingUserTaskList[];
    total: number;
  }> => {
    const filteredEnvironmentIds =
      environmentIds.length > 0
        ? environmentIds
        : (await environmentService.getAllByActor(actor)).map((env) => env.id);

    return await userTaskExecutionRepository.findByEnvironmentIdsAndStatusPaginated(
      filteredEnvironmentIds,
      TaskStatuses.IN_PROGRESS,
      limit,
      offset,
    );
  },

  get: async (id: string, actor: ActorModel, environmentIds: string[]) => {
    const filteredEnvironmentIds =
      environmentIds.length > 0
        ? environmentIds
        : (await environmentService.getAllByActor(actor)).map((env) => env.id);

    const result =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdsWithRelations(
        id,
        filteredEnvironmentIds,
      );

    if (!result) {
      throw new NotFoundError("User task");
    }

    const { userTaskExecution, taskExecution, node, workflow } = result;

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

    const responseData = configuration.responseMap.map((data) => {
      return {
        fieldId: data.fieldId,
        label: data.label,
        dataType: data.type,
      };
    });

    return {
      id: userTaskExecution.id,
      title: userTaskExecution.title,
      assignee: userTaskExecution.assignee,
      startedAt: taskExecution.started_on,
      status: taskExecution.status,
      requestData,
      responseData,
      workflow,
    };
  },

  completeUserTask: async (
    id: string,
    userInput: Record<string, unknown>,
    actor: ActorModel,
    environmentIds: string[],
  ): Promise<{
    userTaskExecution: UserTaskExecutionModel;
    taskExecution: TaskExecutionModel;
  }> => {
    const filteredEnvironmentIds =
      environmentIds.length > 0
        ? environmentIds
        : (await environmentService.getAllByActor(actor)).map((env) => env.id);

    const models =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdsWithRelations(
        id,
        filteredEnvironmentIds,
      );

    if (!models) {
      throw new NotFoundError("User task");
    }

    const { userTaskExecution, taskExecution, node, workflow } = models;
    const task = await taskService.getByIdOrThrow(taskExecution.task_id);

    if (taskExecution.status !== TaskStatuses.IN_PROGRESS) {
      throw new StateTransitionError(
        `Task id=${userTaskExecution.id} is not awaiting user input`,
      );
    }

    const instance = await instanceRepository.findById(workflow.instanceId);
    if (!instance) {
      throw new NotFoundError(`Instance`);
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

    return { taskExecution, userTaskExecution };
  },
};
