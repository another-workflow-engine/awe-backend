import { taskRepository } from "../repositories/task.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { ValidationError } from "../errors/ValidationError.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import {
  TaskStatuses,
  InstanceStatuses,
  TaskTransitionTypes,
} from "../types/enums.js";
import { edgeService } from "./edge.services.js";
import { instanceService } from "./instance.service.js";
import type { ContextVariables } from "../types/engine.js";
import { validateUserTaskInput } from "../utils/inputValidator.utils.js";
import { userTaskExecutionRepository } from "../repositories/userTaskExecution.repository.js";
import type {
  ActorModel,
  TaskModel,
  UserNodeModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { contextUtils } from "../utils/context.utils.js";
import { environmentService } from "./environment.services.js";
import type { PendingUserTaskList } from "../types/userTask.js";
import { nodeService } from "./node.services.js";
import { transitionLogService } from "./transitionLog.service.js";
import { taskService } from "./task.service.js";

export const userTaskService = {
  create: async (
    node: UserNodeModel,
    task: TaskModel,
    executionContext: ContextVariables,
  ) => {
    const configObject = converterUtils.jsonValueToObject(node.configuration);
    const configuration = converterUtils.parseOrThrow(
      UserNodeConfigurationSchema,
      configObject,
    );

    const evaluatedContext =
      await contextUtils.evaluateContext(executionContext);

    const assignee = configuration.assignee
      ? contextUtils.getEvaluatedValue(
          configuration.assignee,
          evaluatedContext,
          "string",
        )
      : null;
    const title = configuration.title ?? null;

    return await db.transaction().execute(async (transaction) => {
      const userTask = await userTaskExecutionRepository.insert(
        {
          status: TaskStatuses.IN_PROGRESS,
          task_id: task.id,
          started_on: new Date(),
          assignee,
          title,
          request_variables: converterUtils.objectToJsonValue(executionContext),
        },
        transaction,
      );
      await transitionLogService.createTaskLog(
        {
          taskId: task.id,
          type: TaskTransitionTypes.STARTED,
          details: { userTaskExecutionId: userTask.id },
        },
        transaction,
      );

      return userTask;
    });
  },

  getPending: async (actor: ActorModel): Promise<PendingUserTaskList[]> => {
    const environment = await environmentService.getByActor(actor);
    return await userTaskExecutionRepository.findByEnvironmentIdAndStatus(
      environment.id,
      TaskStatuses.IN_PROGRESS,
    );
  },

  get: async (id: string, actor: ActorModel) => {
    const environment = await environmentService.getByActor(actor);
    const result =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdWithRelations(
        id,
        environment.id,
      );

    if (!result) {
      throw new NotFoundError("User task");
    }

    const { userTaskExecution, node, workflow } = result;

    const nodeContext = converterUtils.jsonValueToContextVariables(
      userTaskExecution.request_variables,
    );
    const evaluatedContext = await contextUtils.evaluateContext(nodeContext);

    const configuration = converterUtils.parseOrThrow(
      UserNodeConfigurationSchema,
      node.configuration,
    );

    const requestData: Record<string, unknown> = {};
    configuration.requestMap.forEach((data) => {
      requestData[data.label] = contextUtils.getEvaluatedValue(
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
      startedAt: userTaskExecution.started_on,
      status: userTaskExecution.status,
      requestData,
      responseData,
      workflow,
    };
  },

  completeUserTask: async (
    id: string,
    userInput: Record<string, unknown>,
    actor: ActorModel,
  ): Promise<UserTaskExecutionModel> => {
    const environment = await environmentService.getByActor(actor);
    const result =
      await userTaskExecutionRepository.findByIdAndEnvironmentIdWithRelations(
        id,
        environment.id,
      );

    if (!result) {
      throw new NotFoundError("User task");
    }

    const { userTaskExecution, node, workflow } = result;

    if (userTaskExecution.status !== TaskStatuses.IN_PROGRESS) {
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

    const executionContext = converterUtils.jsonValueToContextVariables(
      userTaskExecution.request_variables,
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

    const mainContext = converterUtils.jsonValueToContextVariables(
      instance.current_variables,
    );

    mainContext.constants = {
      ...mainContext.constants,
      ...outputVariables,
    };

    const [nextNodeId] = await edgeService.getDestinationNodeIdsBySourceNodeId(
      node.id,
    );

    return await db.transaction().execute(async (transaction) => {
      const updatedInstance = await instanceService.updateContext(
        instance.id,
        instance.auto_advance
          ? InstanceStatuses.IN_PROGRESS
          : InstanceStatuses.PAUSED,
        mainContext,
        nextNodeId ?? null,
        transaction,
      );

      await taskRepository.updateById(
        userTaskExecution.task_id,
        { status: TaskStatuses.COMPLETED },
        transaction,
      );

      const returnUserTask = await userTaskExecutionRepository.updateById(
        userTaskExecution.id,
        {
          ended_on: new Date(),
          status: TaskStatuses.COMPLETED,
          response_variables: converterUtils.objectToJsonValue(outputVariables),
        },
      );

      if (!nextNodeId) {
        throw new DataIntegrityError(
          "No node after user node. End node missing.",
        );
      }

      const nextNode = await nodeService.getById(nextNodeId);
      if (!nextNode) {
        throw new DataIntegrityError(`Node not found node id = ${nextNodeId}`);
      }

      if (instance.auto_advance) {
        await taskService.create(nextNode, updatedInstance);
      }

      return returnUserTask;
    });
  },
};
