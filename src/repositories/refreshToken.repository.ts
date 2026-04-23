import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { RefreshToken } from "../types/database.js";
import type { Insertable } from "kysely";
import type { DbTransaction, RefreshTokenModel } from "../types/models.js";
import { NotFoundError } from "../errors/NotFoundError.js";

type NewRefreshToken = Insertable<RefreshToken>;

export const refreshTokenRepository = {
  findByToken: async (
    token: string,
    transaction?: DbTransaction,
  ): Promise<RefreshTokenModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("refresh_token")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst();
  },

  insert: async (
    data: NewRefreshToken,
    transaction?: DbTransaction,
  ): Promise<RefreshTokenModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("refresh_token")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Refresh token insert failed", err);
    }
  },

  deleteById: async (id: string, transaction?: DbTransaction) => {
    const result = await (transaction ?? db)
      .deleteFrom("refresh_token")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();

    if (!result.numDeletedRows) {
      throw new NotFoundError("Refresh token");
    }
  },
};
