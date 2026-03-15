import { db } from "../database.js";
import type { DB, Task } from "../types/database.js";
import type { Insertable, Updateable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { TaskModel } from "../types/models.js";
import { TaskStatuses } from "../types/enums.js";

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
};
