import { db } from "../database.js";
import type { Secret, DB } from "../types/database.js";
import type { Insertable, Transaction, Updateable } from "kysely";
import type { SecretModel } from "../types/models.js";
import { RepositoryError } from "../errors/RepositoryError.js";

type NewSecret = Insertable<Secret>;
type UpdateSecret = Updateable<Secret>;

export const secretRepository = {
  findByOrganizationId: async (organizationId: string) => {
    return await db
      .selectFrom("secret")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
  },

  findByEnvironmentId: async (environmentId: string) => {
    return await db
      .selectFrom("secret")
      .selectAll()
      .where("environment_id", "=", environmentId)
      .execute();
  },

  findById: async (id: string) => {
    return await db
      .selectFrom("secret")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findByLabelAndEnvironment: async (label: string, environmentId: string) => {
    return await db
      .selectFrom("secret")
      .selectAll()
      .where("label", "=", label)
      .where("environment_id", "=", environmentId)
      .executeTakeFirst();
  },

  insert: async (
    data: NewSecret,
    transaction?: Transaction<DB>,
  ): Promise<SecretModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("secret")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Secret insert failed", err);
    }
  },

  updateById: async (id: string, data: UpdateSecret) => {
    if (!Object.keys(data).length) {
      return null;
    }

    return await db
      .updateTable("secret")
      .set({
        ...data,
        modified_on: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  deleteById: async (id: string) => {
    return await db
      .deleteFrom("secret")
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },
};
