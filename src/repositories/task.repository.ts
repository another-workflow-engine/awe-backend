import { db } from "../database.js";
import type { DB, Task } from "../types/database.js";
import type { Insertable, Updateable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { TaskModel } from "../types/models.js";

type NewTask = Insertable<Task>;
type UpdateTask = Updateable<Task>;

export const taskRepository = {
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
