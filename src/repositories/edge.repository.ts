import type { Insertable, Transaction } from "kysely";
import type { DB, Edge } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type { EdgeModel } from "../types/models.js";

export type NewEdge = Insertable<Edge>;

export const edgeRepository = {
  findByNodeIds: async (
    ids: string[],
    transaction?: Transaction<DB>,
  ): Promise<EdgeModel[]> => {
    try {
      return await (transaction ?? db)
        .selectFrom("edge")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("source_node_id", "in", ids),
            eb("destination_node_id", "in", ids),
          ]),
        )
        .where("is_deleted", "=", false)
        .execute();
    } catch (err) {
      throw new RepositoryError(`Find edge by node ids=${ids} failed`, err);
    }
  },

  insertMany: async (
    data: NewEdge[],
    transaction?: Transaction<DB>,
  ): Promise<EdgeModel[]> => {
    try {
      return await (transaction ?? db)
        .insertInto("edge")
        .values(data)
        .returningAll()
        .execute();
    } catch (err) {
      throw new RepositoryError("Insert edges failed", err);
    }
  },

  softDeleteByNodeIds: async (
    nodeIds: string[],
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    if (nodeIds.length === 0) return;
    try {
      await (transaction ?? db)
        .updateTable("edge")
        .set({ is_deleted: true })
        .where((eb) =>
          eb.or([
            eb("source_node_id", "in", nodeIds),
            eb("destination_node_id", "in", nodeIds),
          ]),
        )
        .where("is_deleted", "=", false)
        .execute();
    } catch (err) {
      throw new RepositoryError(`Soft delete edges for nodeIds failed`, err);
    }
  },

  deleteByNodeIds: async (
    nodeIds: string[],
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    if (nodeIds.length === 0) return;
    try {
      await (transaction ?? db)
        .deleteFrom("edge")
        .where((eb) =>
          eb.or([
            eb("source_node_id", "in", nodeIds),
            eb("destination_node_id", "in", nodeIds),
          ]),
        )
        .execute();
    } catch (err) {
      throw new RepositoryError(`Delete edges for nodeIds failed`, err);
    }
  },
};
