import { taskRepository } from "../repositories/task.repository.js";
import type { DB, InstanceEventType, TaskStatus } from "../types/database.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskModel,
} from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import type { Transaction } from "kysely";
import { instanceRepository } from "../repositories/instance.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { db } from "../database.js";
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
  transaction?: Transaction<DB>,
): Promise<TaskModel> {
  const executeCallback = async (transaction: Transaction<DB>) => {
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
    : await db.transaction().execute(executeCallback);

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

  nodeSchema.type !== NodeTypes.USER
    ? await queueService.enqueue({
        jobData,
        nodeConfiguration: nodeSchema.configuration,
        ...(attemptsMade && { attemptsMade }),
      })
    : await userTaskService.create({
        jobData,
        nodeConfiguration: nodeSchema.configuration,
        taskContext: taskService.getTaskContext(instance, node),
        transaction,
      });
}

export const taskService = {
  getByIdOrThrow: async (taskId: string): Promise<TaskModel> => {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError("Task");
    }

    return task;
  },

  getAllTaskDetails: async (
    taskId: string,
  ): Promise<{ instance: InstanceModel; node: NodeModel; task: TaskModel }> => {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError("task");
    }

    const [instance, node] = await Promise.all([
      instanceRepository.findById(task.instance_id),
      nodeRepository.findById(task.node_id),
    ]);

    if (!instance) {
      throw new NotFoundError("instance");
    }
    if (!node) {
      throw new NotFoundError("node");
    }

    return { instance, node, task };
  },

  create: async (params: {
    instance: InstanceModel;
    node: NodeModel;
    taskStatus?: TaskStatus;
    transaction: DbTransaction;
  }): Promise<TaskModel> => {
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
      taskStatusToEventMap[taskStatus],
      undefined,
      undefined,
      transaction,
    );

    if (taskStatus === TaskStatuses.IN_PROGRESS) {
      await scheduleNodeExecution({
        instance,
        task,
        node,
        transaction,
        attemptsMade: 0,
      });
    }

    return task;
  },

  resume: async (
    node: NodeModel,
    instance: InstanceModel,
    transaction: Transaction<DB>,
  ): Promise<TaskModel> => {
    let task = await taskRepository.findByStatusAndInstanceId(
      instance.id,
      TaskStatuses.PAUSED,
      transaction,
    );
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

    await scheduleNodeExecution({ instance, task, node, transaction });
    return task;
  },

  retry: async (
    taskId: string,
    instance: InstanceModel,
    node: NodeModel,
    actorId: string,
    transaction: Transaction<DB>,
  ): Promise<TaskModel> => {
    let task = await taskRepository.findById(taskId, transaction);
    if (!task) {
      throw new NotFoundError("task");
    }

    if (task.status !== TaskStatuses.FAILED) {
      throw new StateTransitionError("Only failed tasks can be retried");
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
      LogEventTypes.RETRIED,
      { message: "Manual retry of failed task" },
      actorId,
      transaction,
    );

    await scheduleNodeExecution({ instance, task, node, transaction });
    return task;
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
    transaction?: Transaction<DB>,
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
    transaction?: Transaction<DB>,
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
    transaction?: Transaction<DB>,
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
    transaction?: Transaction<DB>,
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
