import { db } from "../database.js";
import type { TaskStatus, UserTaskExecution } from "../types/database.js";
import type { Insertable } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
  UserTaskExecutionModel,
  WorkflowModel,
} from "../types/models.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  instanceColumns,
  nodeColumns,
  taskColumns,
  taskExecutionColumns,
  userTaskExecutionColumns,
} from "../types/columnNames.js";
import type { PendingUserTaskListItem } from "../types/task.js";

type NewUserTaskExecution = Insertable<UserTaskExecution>;

export const userTaskExecutionRepository = {
  insert: async (
    data: NewUserTaskExecution,
    transaction?: DbTransaction,
  ): Promise<UserTaskExecutionModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("user_task_execution")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("User task execution insert failed", err);
    }
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    id: string,
    environmentIds: string[],
  ): Promise<
    | {
        userTaskExecution: UserTaskExecutionModel;
        taskExecution: TaskExecutionModel;
        node: NodeModel;
        task: TaskModel;
        instance: InstanceModel;
      }
    | undefined
  > => {
    if (environmentIds.length === 0) {
      return;
    }

    const result = await db
      .selectFrom("user_task_execution")
      .innerJoin(
        "task_execution",
        "task_execution.id",
        "user_task_execution.task_execution_id",
      )
      .innerJoin("task", "task.id", "task_execution.task_id")
      .innerJoin("instance", "instance.id", "task.instance_id")
      .innerJoin(
        "workflow_version",
        "workflow_version.id",
        "instance.workflow_version_id",
      )
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .innerJoin("environment", "environment.id", "workflow.environment_id")
      .innerJoin("node", "node.id", "task.node_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<TaskModel>(eb, "task", taskColumns),
        ...columnMapper.prefixedColumns<UserTaskExecutionModel>(
          eb,
          "user_task_execution",
          userTaskExecutionColumns,
        ),
        ...columnMapper.prefixedColumns<TaskExecutionModel>(
          eb,
          "task_execution",
          taskExecutionColumns,
        ),
        ...columnMapper.prefixedColumns<NodeModel>(eb, "node", nodeColumns),
        ...columnMapper.prefixedColumns<InstanceModel>(
          eb,
          "instance",
          instanceColumns,
        ),
      ])
      .where("environment.id", "in", environmentIds)
      .where("user_task_execution.task_execution_id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return;
    }

    return {
      userTaskExecution: columnMapper.extractPrefixed<UserTaskExecutionModel>(
        result,
        "user_task_execution",
      ),

      taskExecution: columnMapper.extractPrefixed<TaskExecutionModel>(
        result,
        "task_execution",
      ),

      node: columnMapper.extractPrefixed<NodeModel>(result, "node"),

      instance: columnMapper.extractPrefixed<InstanceModel>(result, "instance"),

      task: columnMapper.extractPrefixed<TaskModel>(result, "task"),
    };
  },

  findByEnvironmentIdsAndStatusPaginated: async (data: {
    limit: number;
    offset: number;
    assignee: string | undefined;
    status: TaskStatus;
    environmentIds: string[];
  }): Promise<{
    items: PendingUserTaskListItem[];
    total: number;
  }> => {
    if (data.environmentIds.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    try {
      let query = db
        .selectFrom("user_task_execution")
        .innerJoin(
          "task_execution",
          "task_execution.id",
          "user_task_execution.task_execution_id",
        )
        .innerJoin("task", "task.id", "task_execution.task_id")
        .innerJoin("instance", "instance.id", "task.instance_id")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .innerJoin("node", "node.id", "task.node_id")
        .select((eb) => [
          eb
            .ref("user_task_execution.task_execution_id")
            .as("task_execution_id"),
          eb.ref("user_task_execution.title").as("user_task_title"),
          eb.ref("user_task_execution.assignee").as("user_task_assignee"),
          eb.ref("task_execution.created_on").as("user_task_created_on"),
          eb.ref("task.instance_id").as("instance_id"),
          eb.ref("task.id").as("task_id"),
          eb.ref("instance.workflow_version_id").as("workflow_version_id"),
          eb.ref("node.client_id").as("node_client_id"),
          eb.fn.countAll().over().as("total_count"),
        ])
        .where("task_execution.status", "=", data.status)
        .where("workflow.environment_id", "in", data.environmentIds);

      if (data.assignee) {
        query = query.where(
          "user_task_execution.assignee",
          "like",
          `%${data.assignee}%`,
        );
      }
      const results = await query.execute();

      if (results.length === 0) {
        return {
          items: [],
          total: 0,
        };
      }

      return {
        total: results[0] ? Number(results[0].total_count) : 0,
        items: results.map((res) => {
          return {
            id: res.task_execution_id,
            title: res.user_task_title,
            assignee: res.user_task_assignee,
            createdAt: res.user_task_created_on,
            instanceId: res.instance_id,
            taskId: res.task_id,
            workflowVersionId: res.workflow_version_id,
            nodeId: res.node_client_id,
          };
        }),
      };
    } catch (err) {
      throw new RepositoryError(
        "Find pending user tasks with pagination failed",
        err,
      );
    }
  },

  countByEnvironmentIdsAndStatus: async (
    environmentIds: string[],
    status: TaskStatus,
  ): Promise<number> => {
    if (environmentIds.length === 0) {
      return 0;
    }

    const result = await db
      .selectFrom("task")
      .innerJoin("instance", "instance.id", "task.instance_id")
      .innerJoin(
        "workflow_version",
        "workflow_version.id",
        "instance.workflow_version_id",
      )
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .select((eb) => eb.fn.count<number>("instance.id").as("count"))
      .where("workflow.environment_id", "in", environmentIds)
      .where("instance.is_deleted", "=", false)
      .where("workflow.is_deleted", "=", false)
      .where("task.status", "=", status)
      .executeTakeFirst();

    return result ? Number(result.count) : 0;
  },
};
