import { db } from "../database.js";
import type { ApiKey, DB } from "../types/database.js";
import type { Insertable, Transaction, Updateable } from "kysely";
import {
  type ActorModel,
  type ApiKeyModel,
  type EnvironmentModel,
  type OrganizationModel,
} from "../types/models.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  actorColumns,
  apiKeyColumns,
  environmentColumns,
  organizationColumns,
} from "../types/columnNames.js";

type NewApiKey = Insertable<ApiKey>;
type UpdateApiKey = Updateable<ApiKey>;

export const apiKeyRepository = {
  findByOrganizationId: async (organizationId: string) => {
    return await db
      .selectFrom("api_key")
      .innerJoin("environment", "environment.id", "api_key.environment_id")
      .selectAll("api_key")
      .select("environment.type as environment")
      .where("environment.organization_id", "=", organizationId)
      .where("api_key.is_deleted", "=", false)
      .execute();
  },

  countActiveByEnvironmentId: async (
    environmentId: string,
  ): Promise<number> => {
    const result = await db
      .selectFrom("api_key")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("environment_id", "=", environmentId)
      .where("is_revoked", "=", false)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  },

  findByPrefixWithRelations: async (
    prefix: string,
  ): Promise<
    | {
        apiKey: ApiKeyModel;
        organization: OrganizationModel;
        environment: EnvironmentModel;
        actor: ActorModel;
      }
    | undefined
  > => {
    const row = await db
      .selectFrom("api_key")
      .innerJoin("environment", "environment.id", "api_key.environment_id")
      .innerJoin("organization", "organization.id", "organization.actor_id")
      .innerJoin("actor", "actor.id", "api_key.actor_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<ApiKeyModel>(
          eb,
          "api_key",
          apiKeyColumns,
        ),
        ...columnMapper.prefixedColumns<EnvironmentModel>(
          eb,
          "environment",
          environmentColumns,
        ),
        ...columnMapper.prefixedColumns<OrganizationModel>(
          eb,
          "organization",
          organizationColumns,
        ),
        ...columnMapper.prefixedColumns<ActorModel>(eb, "actor", actorColumns),
      ])
      .where("key_prefix", "=", prefix)
      .where("is_deleted", "=", false)
      .executeTakeFirst();

    if (!row) {
      return row;
    }

    return {
      actor: columnMapper.extractPrefixed<ActorModel>(row, "actor"),
      organization: columnMapper.extractPrefixed<OrganizationModel>(
        row,
        "organization",
      ),
      environment: columnMapper.extractPrefixed<EnvironmentModel>(
        row,
        "environment",
      ),
      apiKey: columnMapper.extractPrefixed<ApiKeyModel>(row, "api_key"),
    };
  },

  findById: async (id: string, environments: string[]) => {
    return await db
      .selectFrom("api_key")
      .selectAll()
      .where("id", "=", id)
      .where("environment_id", "in", environments)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  insert: async (
    data: NewApiKey,
    transaction?: Transaction<DB>,
  ): Promise<ApiKeyModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("api_key")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Api key insert failed", err);
    }
  },

  updateById: async (id: string, data: UpdateApiKey) => {
    if (!Object.keys(data).length) {
      return null;
    }

    return await db
      .updateTable("api_key")
      .set({ ...data, modified_on: new Date() })
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .returningAll()
      .executeTakeFirst();
  },

  revokeById: async (id: string): Promise<ApiKeyModel | undefined> => {
    return await db
      .updateTable("api_key")
      .set({ is_revoked: true, revoked_on: new Date() })
      .where("id", "=", id)
      .where("is_revoked", "=", false)
      .where("is_deleted", "=", false)
      .returningAll()
      .executeTakeFirst();
  },

  deleteById: async (id: string) => {
    return await db
      .updateTable("api_key")
      .set({ is_deleted: true, deleted_on: new Date() })
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .returningAll()
      .executeTakeFirst();
  },
};
