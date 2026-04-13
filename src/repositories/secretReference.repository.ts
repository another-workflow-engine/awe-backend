import type { Insertable, Transaction } from "kysely";
import type { DB, SecretReference } from "../types/database.js";
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
};
