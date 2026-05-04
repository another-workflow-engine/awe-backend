import { taskRepository } from "../repositories/task.repository.js";
import type { InstanceEventType, TaskStatus } from "../types/database.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { LogEventTypes, NodeTypes, TaskStatuses } from "../types/enums.js";
import { queueService } from "./queue.service.js";
import { userTaskService } from "./userTaskExecution.service.js";
import type { Context } from "../types/engine.js";
import { eventLogService } from "./eventLog.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { getLogger } from "../logger.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import { EngineError } from "../errors/EngineError.js";
import { NodeSchema } from "../schemas/node.schema.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { ContextSchema } from "../schemas/context.schema.js";
import type { TaskDetail } from "../types/task.js";
import { environmentUtils } from "../utils/environment.utils.js";
import { taskExecutionService } from "./taskExecution.service.js";
import { openTransaction } from "../utils/database.utils.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { instanceService } from "./instance.service.js";
import type { TaskRetryInput } from "../schemas/task.schema.js";

const CONTEXT_REFERENCE_REGEX = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const SECRET_REFERENCE_REGEX = /\bsecret\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

function extractReferences(expression: string, regex: RegExp): string[] {
  const refs = new Set<string>();

  for (const match of expression.matchAll(regex)) {
    if (match[1]) {
      refs.add(match[1]);
    }
  }

  return [...refs];
}

function getReferencedVariables(
  urlExpression: string,
  headers: Record<string, string>,
): string[] {
  const refs = new Set<string>();

  for (const ref of extractReferences(urlExpression, CONTEXT_REFERENCE_REGEX)) {
    refs.add(ref);
  }

  for (const value of Object.values(headers)) {
    for (const ref of extractReferences(value, CONTEXT_REFERENCE_REGEX)) {
      refs.add(ref);
    }
  }

  return [...refs];
}

function getReferencedSecrets(
  urlExpression: string,
  headers: Record<string, string>,
): string[] {
  const refs = new Set<string>();

  for (const ref of extractReferences(urlExpression, SECRET_REFERENCE_REGEX)) {
    refs.add(ref);
  }

  for (const value of Object.values(headers)) {
    for (const ref of extractReferences(value, SECRET_REFERENCE_REGEX)) {
      refs.add(ref);
    }
  }

  return [...refs];
}

const taskStatusToEventMap: Record<TaskStatus, InstanceEventType> = {
  in_progress: LogEventTypes.RESUMED,
  paused: LogEventTypes.PAUSED,
  completed: LogEventTypes.COMPLETED,
  failed: LogEventTypes.FAILED,
  terminated: LogEventTypes.TERMINATED,
};

async function updateTaskStatusAndLog(
  instanceId: string,
  taskId: string,
  status: TaskStatus,
  details?: LogDetailSchema,
  transaction?: DbTransaction,
): Promise<TaskModel> {
  const executeCallback = async (transaction: DbTransaction) => {
    const [task] = await Promise.all([
      taskRepository.updateById(
        taskId,
        {
          status,
        },
        transaction,
      ),

      eventLogService.createTaskLog(
        instanceId,
        taskId,
        taskStatusToEventMap[status],
        details,
        undefined,
        transaction,
      ),
    ]);

    return task;
  };

  const task = transaction
    ? await executeCallback(transaction)
    : await openTransaction(executeCallback);

  getLogger().info(
    { instanceId, taskId, details },
    `Task status changed to ${status}`,
  );

  return task;
}

async function scheduleNodeExecution(params: {
  instance: InstanceModel;
  task: TaskModel;
  node: NodeModel;
  transaction: DbTransaction;
  attemptsMade?: number;
}) {
  const { instance, task, node, transaction, attemptsMade } = params;

  const nodeSchema = converterUtils.parseOrThrow(NodeSchema, node);

  const jobData = {
    instanceId: instance.id,
    taskId: task.id,
    nodeId: node.id,
  };

  if (nodeSchema.type !== NodeTypes.USER) {
    await queueService.enqueue({
      jobData,
      nodeConfiguration: nodeSchema.configuration,
      ...(attemptsMade && { attemptsMade }),
    });
    return undefined;
  }

  const models = await userTaskService.create({
    jobData,
    nodeConfiguration: nodeSchema.configuration,
    taskContext: taskService.getTaskContext(instance, node),
    transaction,
  });
  return models.taskExecution;
}

function toTaskDetail(
  node: NodeModel,
  task: TaskModel,
  executions: {
    taskExecution: TaskExecutionModel;
    userTaskExecution?: UserTaskExecutionModel | undefined;
  }[],
): TaskDetail {
  const nodeSchema = converterUtils.parseOrThrow(NodeSchema, node);

  return {
    id: task.id,
    instanceId: task.instance_id,
    status: task.status,
    createdAt: task.created_on,

    node: {
      id: node.id,
      type: node.type,
      configuration: nodeSchema.configuration,
    },

    executions: executions.map(({ taskExecution, userTaskExecution }) => {
      return {
        id: taskExecution.id,
        status: taskExecution.status,
        startedAt: taskExecution.created_on,
        endedAt: taskExecution.ended_on,

        inputVariables: converterUtils.parseOrThrow(
          ContextSchema,
          taskExecution.input_variables,
        ),
        outputVariables: converterUtils.jsonValueToObject(
          taskExecution.output_variables,
        ),

        ...(userTaskExecution
          ? {
              title: userTaskExecution.title,
              assignee: userTaskExecution.assignee,
            }
          : { title: null, assignee: null }),
      };
    }),
  };
}

export const taskService = {
  getDetail: async (
    taskId: string,
    environments: EnvironmentModel[],
  ): Promise<TaskDetail> => {
    const [taskModels, executions] = await Promise.all([
      taskRepository.findByIdAndEnvironmentIdsWithRelations(
        taskId,
        environmentUtils.getEnvironmentIds(environments),
      ),
      taskExecutionService.getByTaskIdWithUserTask(taskId),
    ]);

    if (!taskModels) {
      throw new NotFoundError("Task");
    }

    const { task, node } = taskModels;

    return toTaskDetail(node, task, executions);
  },

  retry: async (
    data: TaskRetryInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ): Promise<TaskDetail> => {
    const taskModels =
      await taskRepository.findByIdAndEnvironmentIdsWithRelations(
        data.taskId,
        environmentUtils.getEnvironmentIds(environments),
      );

    if (!taskModels) {
      throw new NotFoundError("Task");
    }

    const { task, node, instance } = taskModels;
    if (
      task.status !== TaskStatuses.FAILED &&
      task.status !== TaskStatuses.TERMINATED
    ) {
      throw new StateTransitionError(
        `Task is not failed or terminated. Status is ${task.status}`,
      );
    }

    const updatedTask = await openTransaction(async (transaction) => {
      const updatedInstance = await instanceService.updateContextForRetry(
        instance,
        data.context,
        actor,
        transaction,
      );

      const updatedModels = await taskService.resume(
        node,
        updatedInstance,
        transaction,
        task,
      );

      return updatedModels.task;
    });

    const executions = await taskExecutionService.getByTaskIdWithUserTask(
      updatedTask.id,
    );

    return toTaskDetail(node, task, executions);
  },

  create: async (params: {
    instance: InstanceModel;
    node: NodeModel;
    taskStatus?: TaskStatus;
    transaction: DbTransaction;
  }) => {
    if (!params.taskStatus) {
      params.taskStatus = params.instance.auto_advance
        ? TaskStatuses.IN_PROGRESS
        : TaskStatuses.PAUSED;
    }

    const { instance, node, taskStatus, transaction } = params;

    const task = await taskRepository.insert(
      {
        instance_id: instance.id,
        node_id: node.id,
        status: taskStatus,
      },
      transaction,
    );

    await eventLogService.createTaskLog(
      instance.id,
      task.id,
      LogEventTypes.STARTED,
      undefined,
      undefined,
      transaction,
    );

    let taskExecution: TaskExecutionModel | undefined = undefined;

    if (taskStatus === TaskStatuses.IN_PROGRESS) {
      taskExecution = await scheduleNodeExecution({
        instance,
        task,
        node,
        transaction,
        attemptsMade: 0,
      }).catch(async (error) => {
        taskService.fail(
          instance.id,
          task.id,
          { message: "Failed to create task", error },
          transaction,
        );
        throw error;
      });
    }

    return { task, taskExecution };
  },

  resume: async (
    node: NodeModel,
    instance: InstanceModel,
    transaction: DbTransaction,
    task?: TaskModel,
  ) => {
    if (!task) {
      task = await taskRepository.findByStatusAndInstanceId(
        instance.id,
        TaskStatuses.PAUSED,
        transaction,
      );
    }

    if (!task) {
      return await taskService.create({ instance, node, transaction });
    }

    task = await taskRepository.updateById(
      task.id,
      {
        status: TaskStatuses.IN_PROGRESS,
      },
      transaction,
    );

    await eventLogService.createTaskLog(
      instance.id,
      task.id,
      LogEventTypes.RESUMED,
      undefined,
      undefined,
      transaction,
    );

    const taskExecution = await scheduleNodeExecution({
      instance,
      task,
      node,
      transaction,
    });
    return { task, taskExecution };
  },

  getTaskContext: (instance: InstanceModel, node: NodeModel): Context => {
    const taskContext: Context = {
      constants: {},
      fetchables: {},
      urls: {},
      secrets: {},
    };

    if (node.type === NodeTypes.START) {
      taskContext.constants = converterUtils.jsonValueToObject(
        instance.input_variables,
      );
      return taskContext;
    }

    const instanceContext: Context = converterUtils.parseOrThrow(
      ContextSchema,
      instance.current_variables,
    );

    const nodeInputSchema = converterUtils.jsonValueToNodeInputSchema(
      node.input_schema,
    );

    const addFetchableDependencies = (fetchableName: string): void => {
      const fetchable = instanceContext.fetchables[fetchableName];
      if (!fetchable) {
        throw new EngineError(
          `Required variable ${fetchableName} does not exists in context`,
        );
      }

      const urlSettings = instanceContext.urls[fetchable.urlId];
      if (!urlSettings) {
        throw new DataIntegrityError(
          `Context does not have referenced url of id=${fetchable.urlId} `,
        );
      }

      taskContext.fetchables[fetchableName] = fetchable;
      taskContext.urls[fetchable.urlId] = urlSettings;

      for (const ref of getReferencedVariables(
        urlSettings.urlExpression,
        urlSettings.headers,
      )) {
        if (ref in taskContext.constants || ref in taskContext.fetchables) {
          continue;
        }

        if (ref in instanceContext.constants) {
          taskContext.constants[ref] = instanceContext.constants[ref];
          continue;
        }

        if (instanceContext.fetchables[ref]) {
          addFetchableDependencies(ref);
          continue;
        }

        throw new EngineError(
          `Required variable ${ref} does not exists in context`,
        );
      }

      for (const ref of getReferencedSecrets(
        urlSettings.urlExpression,
        urlSettings.headers,
      )) {
        if (ref in taskContext.secrets) {
          continue;
        }

        const secretId = instanceContext.secrets[ref];
        if (!secretId) {
          throw new EngineError(
            `Required secret ${ref} does not exists in context`,
          );
        }

        taskContext.secrets[ref] = secretId;
      }
    };

    nodeInputSchema.variableNames.forEach((variableName) => {
      if (variableName in instanceContext.constants) {
        taskContext.constants[variableName] =
          instanceContext.constants[variableName];
        return;
      }

      if (instanceContext.fetchables[variableName]) {
        addFetchableDependencies(variableName);
        return;
      }

      throw new EngineError(
        `Required variable ${variableName} does not exists in context`,
      );
    });

    for (const secretName of nodeInputSchema.secretNames ?? []) {
      const secretId = instanceContext.secrets[secretName];
      if (!secretId) {
        throw new EngineError(
          `Required secret ${secretName} does not exists in context`,
        );
      }

      taskContext.secrets[secretName] = secretId;
    }

    return taskContext;
  },

  complete: async (
    instanceId: string,
    taskId: string,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    return await updateTaskStatusAndLog(
      instanceId,
      taskId,
      TaskStatuses.COMPLETED,
      undefined,
      transaction,
    );
  },

  fail: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    return await updateTaskStatusAndLog(
      instanceId,
      taskId,
      TaskStatuses.FAILED,
      details,
      transaction,
    );
  },

  terminate: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    return await updateTaskStatusAndLog(
      instanceId,
      taskId,
      TaskStatuses.TERMINATED,
      details,
      transaction,
    );
  },

  pause: async (
    instanceId: string,
    taskId: string,
    details: LogDetailSchema,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    return await updateTaskStatusAndLog(
      instanceId,
      taskId,
      TaskStatuses.PAUSED,
      details,
      transaction,
    );
  },
};
