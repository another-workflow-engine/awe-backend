import { db } from "../database.js";
import type { ApiKey } from "../types/database.js";
import type { Insertable, Updateable } from "kysely";
import {
  type ActorModel,
  type ApiKeyModel,
  type DbTransaction,
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
  findByEnvironmentIds: async (
    environmentIds: string[],
  ): Promise<ApiKeyModel[]> => {
    if (environmentIds.length === 0) {
      return [];
    }

    return await db
      .selectFrom("api_key")
      .selectAll()
      .where("api_key.environment_id", "in", environmentIds)
      .where("api_key.is_deleted", "=", false)
      .execute();
  },

  findById: async (id: string) => {
    return await db
      .selectFrom("api_key")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  insert: async (
    data: NewApiKey,
    transaction: DbTransaction,
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

  updateById: async (id: string, data: UpdateApiKey): Promise<ApiKeyModel> => {
    return await db
      .updateTable("api_key")
      .set(data)
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .returningAll()
      .executeTakeFirstOrThrow()
      .catch((error) => {
        throw new RepositoryError("API key update failed", error);
      });
  },

  doesUnrevokedExistByEnvironmentId: async (
    environmentId: string,
  ): Promise<boolean> => {
    const result = await db
      .selectFrom("api_key")
      .select("id")
      .where("environment_id", "=", environmentId)
      .where("is_revoked", "=", false)
      .where("is_deleted", "=", false)
      .executeTakeFirst();

    return result !== undefined;
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
      .innerJoin(
        "organization",
        "organization.id",
        "environment.organization_id",
      )
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
      .where("api_key.key_prefix", "=", prefix)
      .where("api_key.is_deleted", "=", false)
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
};
