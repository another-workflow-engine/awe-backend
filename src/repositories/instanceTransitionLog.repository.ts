import type { Insertable, Transaction } from "kysely";
import type { DB, InstanceTransitionLog } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";

export type NewInstanceTransitionLog = Insertable<InstanceTransitionLog>;

export const instanceTransitionLogRepository = {
  insert: async (
    data: NewInstanceTransitionLog,
    transaction?: Transaction<DB>,
  ) => {
    try {
      return await (transaction ?? db)
        .insertInto("instance_transition_log")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert instance transition log failed", err);
    }
  },
};
