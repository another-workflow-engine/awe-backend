import type { Insertable, Transaction } from "kysely";
import type { DB, EnvironmentType, SecretReference } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type {
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
    transaction?: Transaction<DB>,
  ): Promise<SecretReferenceModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("secret_reference")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
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
    transaction?: Transaction<DB>,
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

  findByActor: async (
    actorId: string,
    environments?: EnvironmentType[],
    transaction?: Transaction<DB>,
  ) => {
    let query = (transaction ?? db)
      .selectFrom("secret_reference")
      .innerJoin(
        "environment",
        "environment.id",
        "secret_reference.environment_id",
      )
      .innerJoin("system", "system.id", "environment.system_id")
      .innerJoin("organization", "organization.id", "system.organization_id")
      .select([
        "secret_reference.id",
        "secret_reference.label",
        "secret_reference.secret_key",
        "secret_reference.provider_id",
        "secret_reference.created_on",
        "environment.type as environment",
      ])
      .where("organization.actor_id", "=", actorId)
      .where("organization.is_deleted", "=", false)
      .where("system.is_deleted", "=", false)
      .where("environment.is_deleted", "=", false);

    if (environments && environments.length > 0) {
      query = query.where("environment.type", "in", environments);
    }

    return await query.execute();
  },

  findByProviderAndActor: async (
    providerId: string,
    actorId: string,
    transaction?: Transaction<DB>,
  ) => {
    return await (transaction ?? db)
      .selectFrom("secret_reference")
      .innerJoin(
        "environment",
        "environment.id",
        "secret_reference.environment_id",
      )
      .innerJoin("system", "system.id", "environment.system_id")
      .innerJoin("organization", "organization.id", "system.organization_id")
      .select([
        "secret_reference.id",
        "secret_reference.label",
        "secret_reference.secret_key",
        "secret_reference.provider_id",
        "secret_reference.created_on",
        "environment.type as environment",
      ])
      .where("secret_reference.provider_id", "=", providerId)
      .where("organization.actor_id", "=", actorId)
      .where("organization.is_deleted", "=", false)
      .where("system.is_deleted", "=", false)
      .where("environment.is_deleted", "=", false)
      .execute();
  },

  deleteById: async (
    id: string,
    transaction?: Transaction<DB>,
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
