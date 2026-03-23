import { taskRepository } from "../repositories/task.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { ValidationError } from "../errors/ValidationError.js";
import { db } from "../database.js";
import { converterUtils } from "../utils/converter.utils.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { TaskStatuses, InstanceStatuses, NodeTypes } from "../types/enums.js";
import { edgeService } from "./edge.services.js";
import { instanceService } from "./instance.service.js";
import type { ContextVariables } from "../types/engine.js";
import { validateUserTaskInput } from "../utils/inputValidator.utils.js";
import { userTaskExecutionRepository } from "../repositories/userTaskExecution.repository.js";
import { AppError } from "../errors/AppError.js";
import type {
  ActorModel,
  NodeModel,
  TaskModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { contextUtils } from "../utils/context.utils.js";
import type { Transaction } from "kysely";
import type { DB } from "../types/database.js";
import { environmentService } from "./environment.services.js";
import type { PendingUserTaskList } from "../types/userTask.js";
import { executionEngine } from "../engine/ExecutionEngine.js";
import { nodeService } from "./node.services.js";

export const userTaskService = {
  createNew: async (
    node: NodeModel,
    task: TaskModel,
    executionContext: ContextVariables,
    transaction?: Transaction<DB>,
  ) => {
    if (node.type !== NodeTypes.USER) {
      throw new AppError("Node is not of type USER");
    }

    const configObject = converterUtils.jsonValueToObject(node.configuration);
    const parsed = UserNodeConfigurationSchema.safeParse(configObject);

    if (!parsed.success) {
      throw new DataIntegrityError(
        `Invalid user task node configuration in node id = ${node.id}`,
      );
    }

    const configuration = parsed.data;

    const evaluatedContext =
      await contextUtils.buildFeelContext(executionContext);

    const assignee = configuration.assignee
      ? contextUtils.getEvaluatedValue(
          configuration.assignee,
          evaluatedContext,
          "string",
        )
      : null;
    const title = configuration.title ?? null;

    return await userTaskExecutionRepository.insert(
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
    const evaluatedContext = await contextUtils.buildFeelContext(nodeContext);

    const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Invalid user node configuration node id = ${node.id}`,
      );
    }

    const configuration = parsed.data;

    const requestData: Record<string, unknown> = {};
    configuration.requestMap.map((data) => {
      return {
        label: data.label,
        value: contextUtils.getEvaluatedValue(
          data.valueExpression,
          evaluatedContext,
          "unknowm",
        ),
      };
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

    const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success)
      throw new DataIntegrityError(
        `User node configuration invalid for node id=${node.id}`,
      );

    const configuration = parsed.data;

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
      await instanceService.updateContext(
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
        await executionEngine.createNewTask(nextNode, instance, transaction);
      }

      return returnUserTask;
    });
  },
};
