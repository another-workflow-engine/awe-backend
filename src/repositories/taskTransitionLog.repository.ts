import type { Insertable, Transaction } from "kysely";
import type { DB, TaskTransitionLog } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";

export type NewTaskTransitionLog = Insertable<TaskTransitionLog>;

export const taskTransitionLogRepository = {
  insert: async (data: NewTaskTransitionLog, transaction?: Transaction<DB>) => {
    try {
      return await (transaction ?? db)
        .insertInto("task_transition_log")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert task transition log failed", err);
    }
  },
};
