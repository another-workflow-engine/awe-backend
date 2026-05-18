import type { Insertable } from "kysely";
import type { SecretReference } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type {
  DbTransaction,
  SecretProviderModel,
  SecretReferenceModel,
} from "../types/models.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  secretProviderColumns,
  secretReferenceColumns,
} from "../types/columnNames.js";

export type NewReference = Insertable<SecretReference>;

export const secretReferenceRepository = {
  findById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<SecretReferenceModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("secret_reference")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findKeysByProviderId: async (providerId: string): Promise<Omit<SecretReferenceModel, "provider_id" | "environment_id" | "created_on">[]> => {
    const results = await db
      .selectFrom("secret_reference")
      .select(["id", "secret_key"])
      .where("provider_id", "=", providerId)
      .execute();
    return results;
  },

  findByIdsWithProviders: async (
    ids: string[],
  ): Promise<Map<SecretProviderModel, SecretReferenceModel[]>> => {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await db
      .selectFrom("secret_reference")
      .innerJoin(
        "secret_provider",
        "secret_provider.id",
        "secret_reference.provider_id",
      )
      .select((eb) => [
        ...columnMapper.prefixedColumns<SecretProviderModel>(
          eb,
          "secret_provider",
          secretProviderColumns,
        ),
        ...columnMapper.prefixedColumns<SecretReferenceModel>(
          eb,
          "secret_reference",
          secretReferenceColumns,
        ),
      ])
      .where("secret_reference.id", "in", ids)
      .execute();

    return rows.reduce<Map<SecretProviderModel, SecretReferenceModel[]>>(
      (acc, row) => {
        const provider = columnMapper.extractPrefixed<SecretProviderModel>(
          row,
          "secret_provider",
        );
        const reference = columnMapper.extractPrefixed<SecretReferenceModel>(
          row,
          "secret_reference",
        );

        const existing = [...acc.entries()].find(([p]) => p.id === provider.id);

        if (existing) {
          existing[1].push(reference);
        } else {
          acc.set(provider, [reference]);
        }

        return acc;
      },
      new Map(),
    );
  },

  insert: async (
    data: NewReference,
    transaction?: DbTransaction,
  ): Promise<SecretReferenceModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("secret_reference")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert secret reference failed", err);
    }
  },

  findByEnvironmentIds: async (environmentIds: string[], providerId?: string) => {
    if (environmentIds.length === 0) {
      return [];
    }

    let query = db
      .selectFrom("secret_reference")
      .innerJoin(
        "secret_provider",
        "secret_provider.id",
        "secret_reference.provider_id",
      )
      .select((eb) => [
        ...columnMapper.prefixedColumns(
          eb,
          "secret_reference",
          secretReferenceColumns,
        ),
        ...columnMapper.prefixedColumns(
          eb,
          "secret_provider",
          secretProviderColumns,
        ),
      ])
      .where("secret_reference.environment_id", "in", environmentIds)
    
    if (providerId) {
      query = query.where("secret_reference.provider_id", "=", providerId);
    }

    const results = await query.execute();
    

    return results.map((res) => {
      return {
        secretReference: columnMapper.extractPrefixed<SecretReferenceModel>(
          res,
          "secret_reference",
        ),
        secretProvider: columnMapper.extractPrefixed<SecretProviderModel>(
          res,
          "secret_provider",
        ),
      };
    });
  },

  findByProviderAndActor: async (
    providerId: string,
    actorId: string,
    environmentIds: string[],
  ) => {
    if (environmentIds.length === 0) {
      return [];
    }

    return await db
      .selectFrom("secret_reference")
      .innerJoin(
        "environment",
        "environment.id",
        "secret_reference.environment_id",
      )
      .innerJoin(
        "organization",
        "organization.id",
        "environment.organization_id",
      )
      .selectAll("secret_reference")
      .select("environment.type as environment")
      .where("secret_reference.provider_id", "=", providerId)
      .where("organization.actor_id", "=", actorId)
      .where("environment.id", "in", environmentIds)
      .execute();
  },

  deleteById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<boolean> => {
    try {
      const result = await (transaction ?? db)
        .deleteFrom("secret_reference")
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    } catch (err) {
      throw new RepositoryError("Delete secret reference failed", err);
    }
  },
};
