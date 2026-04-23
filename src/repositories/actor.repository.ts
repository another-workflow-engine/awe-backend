import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { Actor } from "../types/database.js";
import type { Insertable } from "kysely";
import type { ActorModel, DbTransaction } from "../types/models.js";

type NewActor = Insertable<Actor>;

export const actorRepository = {
  insert: async (
    data: NewActor,
    transaction: DbTransaction,
  ): Promise<ActorModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("actor")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Actor insert failed", err);
    }
  },
};
