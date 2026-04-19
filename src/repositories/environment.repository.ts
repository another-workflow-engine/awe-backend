import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { Environment, DB } from "../types/database.js";
import type { Insertable, Transaction } from "kysely";
import type { EnvironmentModel } from "../types/models.js";
import type { EnvironmentType } from "../types/database.js";

type NewEnvironment = Insertable<Environment>;

export const environmentRepository = {
  findByType: async (
    type: EnvironmentType,
    transaction?: Transaction<DB>,
  ): Promise<EnvironmentModel[]> => {
    return await (transaction ?? db)
      .selectFrom("environment")
      .selectAll()
      .where("type", "=", type)
      .where("is_deleted", "=", false)
      .execute();
  },

  findById: async (id: string, transaction?: Transaction<DB>) => {
    return await (transaction ?? db)
      .selectFrom("environment")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByOrganizationId: async (
    organizationId: string,
    transaction?: Transaction<DB>,
  ): Promise<EnvironmentModel[]> => {
    return await (transaction ?? db)
      .selectFrom("environment")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("is_deleted", "=", false)
      .execute();
  },

  findByApiKeyActorId: async (
    actorId: string,
    transaction?: Transaction<DB>,
  ): Promise<EnvironmentModel[]> => {
    return await (transaction ?? db)
      .selectFrom("environment")
      .innerJoin("api_key", "api_key.environment_id", "environment.id")
      .selectAll("environment")
      .where("api_key.actor_id", "=", actorId)
      .where("api_key.is_revoked", "=", false)
      .where("api_key.is_deleted", "=", false)
      .where("environment.is_deleted", "=", false)
      .execute();
  },

  insertMany: async (
    data: NewEnvironment[],
    transaction?: Transaction<DB>,
  ): Promise<EnvironmentModel[]> => {
    try {
      return await (transaction ?? db)
        .insertInto("environment")
        .values(data)
        .returningAll()
        .execute();
    } catch (err) {
      throw new RepositoryError("Environment insert failed", err);
    }
  },
};
