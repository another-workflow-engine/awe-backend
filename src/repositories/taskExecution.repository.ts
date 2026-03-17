import { db } from "../database.js";
import type { DB, TaskExecution } from "../types/database.js";
import type { Insertable, Updateable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { TaskExecutionModel } from "../types/models.js";

type NewTaskExecution = Insertable<TaskExecution>;
type UpdateTaskExecution = Updateable<TaskExecution>;

export const taskExecutionRepository = {
  insert: async (
    data: NewTaskExecution,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("task_execution")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task execution insert failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateTaskExecution,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    try {
      console.log(id);
      return await (transaction ?? db)
        .updateTable("task_execution")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task execution update failed", err);
    }
  },
};
