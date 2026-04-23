import type { Insertable } from "kysely";
import type { Edge } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type { DbTransaction, EdgeModel } from "../types/models.js";

export type NewEdge = Insertable<Edge>;

export const edgeRepository = {
  findBySourceNodeId: async (id: string, transaction?: DbTransaction) => {
    return await (transaction ?? db)
      .selectFrom("edge")
      .selectAll()
      .where("source_node_id", "=", id)
      .where("is_deleted", "=", false)
      .execute();
  },

  findByNodeIds: async (
    ids: string[],
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
  ): Promise<EdgeModel[]> => {
    if (data.length === 0) return [];
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

  deleteByNodeIds: async (
    nodeIds: string[],
    transaction?: DbTransaction,
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
