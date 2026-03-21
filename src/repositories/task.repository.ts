import { db } from "../database.js";
import type { DB, Task } from "../types/database.js";
import type { Insertable, Updateable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { TaskModel } from "../types/models.js";
import { TaskStatuses, NodeTypes } from "../types/enums.js";

export type TaskListItem = TaskModel & {
  node_configuration: unknown;
  workflow_name: string;
  version_number: number | null;
};

export type TaskDetailItem = TaskModel & {
  node_configuration: unknown;
  workflow_name: string;
  version_number: number | null;
  instance_context: unknown | null;
};

type NewTask = Insertable<Task>;
type UpdateTask = Updateable<Task>;

export const taskRepository = {
  findById: async (
    id: string,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel | undefined> => {
    try {
      return await (transaction ?? db)
        .selectFrom("task")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    } catch (err) {
      throw new RepositoryError(`Find task by id=${id} failed`, err);
    }
  },

  findLastCreatedByInstanceId: async (
    instanceId: string,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("task")
      .selectAll()
      .where("instance_id", "=", instanceId)
      .orderBy("created_on", "desc")
      .limit(1)
      .executeTakeFirst();
  },

  insert: async (
    data: NewTask,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("task")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task insert failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateTask,
    transaction?: Transaction<DB>,
  ): Promise<TaskModel> => {
    try {
      return await (transaction ?? db)
        .updateTable("task")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task update failed", err);
    }
  },

  findAllPending: async (actorId: string): Promise<TaskDetailItem[]> => {
    try {
      return (await db
        .selectFrom("task")
        .innerJoin("node", "node.id", "task.node_id")
        .innerJoin("instance", "instance.id", "task.instance_id")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .selectAll("task")
        .select((eb) => [
          eb.ref("node.configuration").as("node_configuration"),
          eb.ref("workflow.name").as("workflow_name"),
          eb.ref("workflow_version.version").as("version_number"),
          eb.ref("instance.current_variables").as("instance_context"),
        ])
        .where("instance.is_deleted", "=", false)
        .where("task.status", "=", TaskStatuses.IN_PROGRESS)
        .where("node.type", "=", NodeTypes.USER)
        .where("workflow.created_by", "=", actorId)
        .orderBy("task.created_on", "desc")
        .execute()) as unknown as TaskDetailItem[];
    } catch (err) {
      throw new RepositoryError("Find all pending tasks failed", err);
    }
  },

  findByIdWithContext: async (
    id: string,
    actorId: string,
  ): Promise<TaskDetailItem | undefined> => {
    try {
      return (await db
        .selectFrom("task")
        .innerJoin("node", "node.id", "task.node_id")
        .innerJoin("instance", "instance.id", "task.instance_id")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .selectAll("task")
        .select((eb) => [
          eb.ref("node.configuration").as("node_configuration"),
          eb.ref("workflow.name").as("workflow_name"),
          eb.ref("workflow_version.version").as("version_number"),
          eb.ref("instance.current_variables").as("instance_context"),
        ])
        .where("task.id", "=", id)
        .where("workflow.created_by", "=", actorId)
        .executeTakeFirst()) as unknown as TaskDetailItem | undefined;
    } catch (err) {
      throw new RepositoryError(
        `Find task by id=${id} with context failed`,
        err,
      );
    }
  },
};
