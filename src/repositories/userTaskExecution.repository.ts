import { db } from "../database.js";
import type { DB, TaskStatus, UserTaskExecution } from "../types/database.js";
import type { Insertable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  NodeModel,
  TaskExecutionModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import type {
  PendingUserTaskList,
  WorkflowDetailsForUserTask,
} from "../types/userTask.js";

type NewUserTaskExecution = Insertable<UserTaskExecution>;

export const userTaskExecutionRepository = {
  insert: async (
    data: NewUserTaskExecution,
    transaction?: Transaction<DB>,
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
    transaction?: Transaction<DB>,
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
          eb.ref("workflow_version.version").as("workflow_version"),
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
          id: row.workflow_id,
          name: row.workflow_name,
          version: row.workflow_version,
        },
      }));
    } catch (err) {
      throw new RepositoryError("Find all pending user tasks failed", err);
    }
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    id: string,
    environmentIds: string[],
    transaction?: Transaction<DB>,
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
        eb.ref("user_task_execution.id").as("user_task_execution_id"),
        eb
          .ref("user_task_execution.task_execution_id")
          .as("user_task_execution_task_execution_id"),
        eb.ref("user_task_execution.title").as("user_task_execution_title"),
        eb
          .ref("user_task_execution.assignee")
          .as("user_task_execution_assignee"),
        eb
          .ref("user_task_execution.created_on")
          .as("user_task_execution_created_on"),

        eb.ref("task_execution.id").as("task_execution_id"),
        eb.ref("task_execution.task_id").as("task_execution_task_id"),
        eb.ref("task_execution.started_on").as("task_execution_started_on"),
        eb.ref("task_execution.ended_on").as("task_execution_ended_on"),
        eb.ref("task_execution.status").as("task_execution_status"),
        eb
          .ref("task_execution.input_variables")
          .as("task_execution_input_variables"),
        eb
          .ref("task_execution.output_variables")
          .as("task_execution_output_variables"),
        eb.ref("task_execution.created_on").as("task_execution_created_on"),

        eb.ref("node.id").as("node_id"),
        eb.ref("node.client_id").as("node_client_id"),
        eb.ref("node.workflow_version_id").as("node_workflow_version_id"),
        eb.ref("node.name").as("node_name"),
        eb.ref("node.type").as("node_type"),
        eb.ref("node.max_attempts").as("node_max_attempts"),
        eb.ref("node.input_schema").as("node_input_schema"),
        eb.ref("node.output_schema").as("node_output_schema"),
        eb.ref("node.configuration").as("node_configuration"),
        eb.ref("node.description").as("node_description"),
        eb.ref("node.x_coordinate").as("node_x_coordinate"),
        eb.ref("node.y_coordinate").as("node_y_coordinate"),
        eb.ref("node.created_on").as("node_created_on"),
        eb.ref("node.created_by").as("node_created_by"),
        eb.ref("node.modified_on").as("node_modified_on"),
        eb.ref("node.modified_by").as("node_modified_by"),
        eb.ref("node.is_deleted").as("node_is_deleted"),
        eb.ref("node.deleted_on").as("node_deleted_on"),
        eb.ref("node.deleted_by").as("node_deleted_by"),

        eb.ref("task.instance_id").as("instance_id"),
        eb.ref("workflow.id").as("workflow_id"),
        eb.ref("workflow.name").as("workflow_name"),
        eb.ref("workflow_version.version").as("workflow_version"),
      ])
      .where("environment.id", "in", environmentIds)
      .where("user_task_execution.id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return;
    }

    return {
      userTaskExecution: {
        id: result.user_task_execution_id,
        task_execution_id: result.user_task_execution_task_execution_id,

        title: result.user_task_execution_title,
        assignee: result.user_task_execution_assignee,

        created_on: result.user_task_execution_created_on,
      },

      taskExecution: {
        id: result.task_execution_id,
        task_id: result.task_execution_task_id,
        started_on: result.task_execution_started_on,
        ended_on: result.task_execution_ended_on,
        status: result.task_execution_status,
        input_variables: result.task_execution_input_variables,
        output_variables: result.task_execution_output_variables,
        created_on: result.task_execution_created_on,
      },

      node: {
        id: result.node_id,
        client_id: result.node_client_id,
        workflow_version_id: result.node_workflow_version_id,
        name: result.node_name,
        type: result.node_type,
        max_attempts: result.node_max_attempts,
        input_schema: result.node_input_schema,
        output_schema: result.node_output_schema,
        configuration: result.node_configuration,
        description: result.node_description,
        x_coordinate: result.node_x_coordinate,
        y_coordinate: result.node_y_coordinate,
        created_on: result.node_created_on,
        created_by: result.node_created_by,
        modified_on: result.node_modified_on,
        modified_by: result.node_modified_by,
        is_deleted: result.node_is_deleted,
        deleted_on: result.node_deleted_on,
        deleted_by: result.node_deleted_by,
      },

      workflow: {
        id: result.workflow_id,
        name: result.workflow_name,
        version: result.workflow_version,
        instanceId: result.instance_id,
      },
    };
  },

  findByEnvironmentIdsAndStatusPaginated: async (
    environmentIds: string[],
    status: TaskStatus,
    limit: number,
    offset: number,
    transaction?: Transaction<DB>,
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
      const items = await (transaction ?? db)
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
          eb.ref("workflow_version.version").as("workflow_version"),
        ])
        .where("task_execution.status", "=", status)
        .where("workflow.environment_id", "in", environmentIds)
        .orderBy("user_task_execution.created_on", "desc")
        .limit(limit)
        .offset(offset)
        .execute();

      const countResult = await (transaction ?? db)
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
        .select((eb) =>
          eb.fn.count<number>("user_task_execution.id").as("count"),
        )
        .where("task_execution.status", "=", status)
        .where("workflow.environment_id", "in", environmentIds)
        .executeTakeFirstOrThrow();

      const formattedItems = items.map((row) => ({
        id: row.user_task_execution_id,
        title: row.user_task_execution_title,
        assignee: row.user_task_execution_assignee,
        createdAt: row.user_task_execution_created_on,

        workflow: {
          instanceId: row.instance_id,
          id: row.workflow_id,
          name: row.workflow_name,
          version: row.workflow_version,
        },
      }));

      return {
        items: formattedItems,
        total: Number(countResult.count),
      };
    } catch (err) {
      throw new RepositoryError(
        "Find pending user tasks with pagination failed",
        err,
      );
    }
  },
};
