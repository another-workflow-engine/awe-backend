import type { Insertable, Transaction } from "kysely";
import type { DB, InstanceLog } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";

export type NewInstanceLog = Insertable<InstanceLog>;

export const instanceLogRepository = {
  insert: async (data: NewInstanceLog, transaction?: Transaction<DB>) => {
    try {
      return await (transaction ?? db)
        .insertInto("instance_log")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert instance log failed", err);
    }
  },
};
