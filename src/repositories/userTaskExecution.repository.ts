import { db } from "../database.js";
import type { TaskStatus, UserTaskExecution } from "../types/database.js";
import type { Insertable } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  UserTaskExecutionModel,
  WorkflowModel,
} from "../types/models.js";
import type {
  PendingUserTaskList,
  WorkflowDetailsForUserTask,
} from "../types/userTask.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  instanceColumns,
  nodeColumns,
  taskExecutionColumns,
  userTaskExecutionColumns,
  workflowColumns,
} from "../types/columnNames.js";

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

  findByEnvironmentIdsAndStatus: async (
    environmentIds: string[],
    status: TaskStatus,
    transaction?: DbTransaction,
  ): Promise<PendingUserTaskList[]> => {
    if (environmentIds.length === 0) {
      return [];
    }

    try {
      const result = await (transaction ?? db)
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
        .select((eb) => [
          eb.ref("user_task_execution.id").as("user_task_execution_id"),
          eb.ref("user_task_execution.title").as("user_task_execution_title"),
          eb
            .ref("user_task_execution.assignee")
            .as("user_task_execution_assignee"),
          eb
            .ref("user_task_execution.created_on")
            .as("user_task_execution_created_on"),

          eb.ref("task.instance_id").as("instance_id"),
          eb.ref("workflow.id").as("workflow_id"),
          eb.ref("workflow.name").as("workflow_name"),
          eb.ref("workflow_version.id").as("workflow_version_id"),
        ])
        .where("task_execution.status", "=", status)
        .where("workflow.environment_id", "in", environmentIds)
        .execute();

      return result.map((row) => ({
        id: row.user_task_execution_id,
        title: row.user_task_execution_title,
        assignee: row.user_task_execution_assignee,
        createdAt: row.user_task_execution_created_on,
        workflow: {
          instanceId: row.instance_id,
          versionId: row.workflow_version_id,
          name: row.workflow_name,
        },
      }));
    } catch (err) {
      throw new RepositoryError("Find all pending user tasks failed", err);
    }
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    id: string,
    environmentIds: string[],
    transaction?: DbTransaction,
  ): Promise<
    | {
        userTaskExecution: UserTaskExecutionModel;
        taskExecution: TaskExecutionModel;
        node: NodeModel;
        workflow: WorkflowDetailsForUserTask;
      }
    | undefined
  > => {
    if (environmentIds.length === 0) {
      return;
    }

    const result = await (transaction ?? db)
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
        ...columnMapper.prefixedColumns<WorkflowModel>(
          eb,
          "workflow",
          workflowColumns,
        ),
      ])
      .where("environment.id", "in", environmentIds)
      .where("user_task_execution.id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return;
    }

    const instance = columnMapper.extractPrefixed<InstanceModel>(
      result,
      "instance",
    );
    const workflow = columnMapper.extractPrefixed<WorkflowModel>(
      result,
      "workflow",
    );

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

      workflow: {
        instanceId: instance.id,
        versionId: instance.workflow_version_id,
        name: workflow.name,
      },
    };
  },

  findByEnvironmentIdsAndStatusPaginated: async (
    environmentIds: string[],
    status: TaskStatus,
    assignee: string | undefined,
    limit: number,
    offset: number,
    transaction?: DbTransaction,
  ): Promise<{
    items: PendingUserTaskList[];
    total: number;
  }> => {
    if (environmentIds.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    try {
      const executor = transaction ?? db;

      let baseQuery = executor
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
        .where("task_execution.status", "=", status)
        .where("workflow.environment_id", "in", environmentIds);

      if (assignee) {
        baseQuery = baseQuery.where(
          "user_task_execution.assignee",
          "like",
          `%${assignee}%`,
        );
      }

      const [items, countResult] = await Promise.all([
        baseQuery
          .select((expressionBuilder) => [
            expressionBuilder
              .ref("user_task_execution.id")
              .as("user_task_execution_id"),

            expressionBuilder
              .ref("user_task_execution.title")
              .as("user_task_execution_title"),

            expressionBuilder
              .ref("user_task_execution.assignee")
              .as("user_task_execution_assignee"),

            expressionBuilder
              .ref("user_task_execution.created_on")
              .as("user_task_execution_created_on"),

            expressionBuilder.ref("task.instance_id").as("instance_id"),

            expressionBuilder.ref("workflow.id").as("workflow_id"),

            expressionBuilder.ref("workflow.name").as("workflow_name"),

            expressionBuilder
              .ref("workflow_version.id")
              .as("workflow_version_id"),
          ])
          .orderBy("user_task_execution.created_on", "desc")
          .limit(limit)
          .offset(offset)
          .execute(),

        baseQuery
          .select((expressionBuilder) =>
            expressionBuilder.fn
              .count<number>("user_task_execution.id")
              .as("count"),
          )
          .executeTakeFirst(),
      ]);

      const formattedItems = items.map((row) => ({
        id: row.user_task_execution_id,
        title: row.user_task_execution_title,
        assignee: row.user_task_execution_assignee,
        createdAt: row.user_task_execution_created_on,

        workflow: {
          instanceId: row.instance_id,
          name: row.workflow_name,
          versionId: row.workflow_version_id,
        },
      }));

      return {
        items: formattedItems,
        total: countResult ? Number(countResult.count) : 0,
      };
    } catch (err) {
      throw new RepositoryError(
        "Find pending user tasks with pagination failed",
        err,
      );
    }
  },
};
