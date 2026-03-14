import { type Insertable, type Transaction, type Updateable } from "kysely";
import type { DB, Instance } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";

export type NewInstance = Insertable<Instance>;
export type UpdateInstance = Updateable<Instance>;

export const instanceRepository = {
  insert: async (data: NewInstance, transaction?: Transaction<DB>) => {
    try {
      return await (transaction ?? db)
        .insertInto("instance")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert instance failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateInstance,
    transaction?: Transaction<DB>,
  ) => {
    try {
      return await (transaction ?? db)
        .updateTable("instance")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Update instance failed", err);
    }
  },
};
