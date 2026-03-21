import {
  taskRepository,
  type TaskDetailItem,
} from "../repositories/task.repository.js";
import { UserNodeConfigurationSchema } from "../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import type { DB, TaskStatus } from "../types/database.js";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type { Transaction } from "kysely";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { buildFeelContext } from "../utils/contextResolver.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { ContextVariables } from "../types/engine.js";
import { instanceService } from "./instance.service.js";
import { nodeService } from "./node.services.js";

export interface ResolvedTask {
  id: string;
  instance_id: string;
  node_id: string;
  status: string;
  created_on: string;
  workflow_name: string;
  node_configuration: {
    title?: string;
    description?: string;
    assignee?: string;
    requestMap: Array<{ label: string; value: unknown }>;
    responseMap: unknown[];
  };
}

async function resolveTask(
  task: TaskDetailItem,
  fetch: boolean,
): Promise<ResolvedTask> {
  const parsed = UserNodeConfigurationSchema.safeParse(task.node_configuration);
  if (!parsed.success) {
    throw new DataIntegrityError(
      `Node id=${task.node_id} has an invalid configuration`,
    );
  }

  const configuration = parsed.data;

  const instance = await instanceService.findById(task.instance_id);
  if (!instance) {
    throw new DataIntegrityError(
      `No instance referenced to node id=${task.node_id}`,
    );
  }

  if (!fetch) {
    const { instance_context: _, ...rest } = task;

    return {
      ...rest,
      node_configuration: {
        title: configuration.title,
        description: configuration.description,
        assignee: null,
        requestMap: [],
        responseMap: configuration.responseMap,
      },
    } as unknown as ResolvedTask;
  }

  const context = await buildFeelContext(
    converterUtils.jsonValueToObject(
      instance.current_variables,
    ) as ContextVariables,
  );

  let resolvedAssignee: unknown;

  if (configuration.assignee) {
    const result = evaluate(configuration.assignee, context);
    if (result.warnings.length > 0) {
      throw new DataIntegrityError(
        `FEEL evaluation failed for expression "${configuration.assignee}"`,
      );
    }

    resolvedAssignee = result.value;
  }

  const resolvedRequestMap = configuration.requestMap.map((field) => {
    const result = evaluate(field.valueExpression, context);
    if (result.warnings.length > 0) {
      throw new DataIntegrityError(
        `FEEL evaluation failed for expression "${configuration.assignee}"`,
      );
    }

    return { label: field.label, value: result.value };
  });

  const { instance_context: _, ...rest } = task;

  return {
    ...rest,
    node_configuration: {
      title: configuration.title,
      description: configuration.description,
      assignee: resolvedAssignee,
      requestMap: resolvedRequestMap,
      responseMap: configuration.responseMap,
    },
  } as unknown as ResolvedTask;
}

export const taskService = {
  findById: async (
    taskId: string,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel | null> => {
    const task = await taskRepository.findById(taskId, transaction);
    return task ?? null;
  },

  listPending: async (actorId: string): Promise<ResolvedTask[]> => {
    const tasks = await taskRepository.findAllPending(actorId);
    return Promise.all(
      tasks.map(async (t) => {
        return await resolveTask(t, false);
      }),
    );
  },

  getTask: async (
    taskId: string,
    actorId: string,
  ): Promise<ResolvedTask | undefined> => {
    const task = await taskRepository.findByIdWithContext(taskId, actorId);
    if (!task) {
      return undefined;
    }
    return await resolveTask(task, true);
  },

  getAllTaskDetails: async (
    taskId: string,
  ): Promise<{ instance: InstanceModel; node: NodeModel; task: TaskModel }> => {
    const task = await taskService.findById(taskId);
    if (!task) {
      throw new NotFoundError("task");
    }

    const [instance, node] = await Promise.all([
      instanceService.findById(task.instance_id),
      nodeService.getById(task.node_id),
    ]);

    if (!instance) {
      throw new NotFoundError("instance");
    }
    if (!node) {
      throw new NotFoundError("node");
    }

    return { instance, node, task };
  },

  createNew: async (
    instanceId: string,
    nodeId: string,
    status: TaskStatus,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    return taskRepository.insert(
      {
        instance_id: instanceId,
        node_id: nodeId,
        status,
      },
      transaction,
    );
  },
  updateStatus: async (
    taskId: string,
    status: TaskStatus,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    return taskRepository.updateById(
      taskId,
      {
        status,
      },
      transaction,
    );
  },
};
