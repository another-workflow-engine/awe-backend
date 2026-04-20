import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { DB, Actor } from "../types/database.js";
import type { Transaction, Insertable } from "kysely";
import type { ActorModel } from "../types/models.js";

type NewActor = Insertable<Actor>;

export const actorRepository = {
  insert: async (
    data: NewActor,
    transaction?: Transaction<DB>,
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
