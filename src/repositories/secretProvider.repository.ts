import type { Insertable } from "kysely";
import type { SecretProvider } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type { DbTransaction, SecretProviderModel } from "../types/models.js";

export type NewProvider = Insertable<SecretProvider>;

export const secretProviderRepository = {
  findById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<SecretProviderModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("secret_provider")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findByOrganizationId: async (
    organizationId: string,
  ): Promise<SecretProviderModel[]> => {
    return await db
      .selectFrom("secret_provider")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
  },

  findByIds: async (ids: string[]): Promise<SecretProviderModel[]> => {
    if (ids.length === 0) {
      return [];
    }

    return await db
      .selectFrom("secret_provider")
      .selectAll()
      .where("id", "in", ids)
      .execute();
  },

  insert: async (
    data: NewProvider,
    transaction?: DbTransaction,
  ): Promise<SecretProviderModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("secret_provider")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert secret provider failed", err);
    }
  },
};
