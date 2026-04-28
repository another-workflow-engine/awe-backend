import type { Insertable } from "kysely";
import type { Node, NodeType } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type { DbTransaction, NodeModel } from "../types/models.js";

export type NewNode = Insertable<Node>;

export const nodeRepository = {
  findById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<NodeModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("node")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByIds: async (
    ids: string[],
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    if (ids.length === 0) return [];

    return await (transaction ?? db)
      .selectFrom("node")
      .selectAll()
      .where("id", "in", ids)
      .where("is_deleted", "=", false)
      .execute();
  },

  findByWorkflowVersionId: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    try {
      return await (transaction ?? db)
        .selectFrom("node")
        .selectAll()
        .where("workflow_version_id", "=", id)
        .where("is_deleted", "=", false)
        .execute();
    } catch (err) {
      throw new RepositoryError(
        `Find node by workflow version id=${id} failed`,
        err,
      );
    }
  },

  findByWorkflowVersionIdAndNodeType: async (
    id: string,
    nodeType: NodeType,
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    return await (transaction ?? db)
      .selectFrom("node")
      .selectAll()
      .where("workflow_version_id", "=", id)
      .where("type", "=", nodeType)
      .where("is_deleted", "=", false)
      .execute();
  },

  insert: async (
    data: NewNode,
    transaction?: DbTransaction,
  ): Promise<NodeModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("node")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert node failed", err);
    }
  },

  insertMany: async (
    data: NewNode[],
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    try {
      return await (transaction ?? db)
        .insertInto("node")
        .values(data)
        .returningAll()
        .execute();
    } catch (err) {
      throw new RepositoryError("Insert node failed", err);
    }
  },

  deleteByWorkflowVersionId: async (
    workflowVersionId: string,
    transaction?: DbTransaction,
  ): Promise<void> => {
    try {
      await (transaction ?? db)
        .deleteFrom("node")
        .where("workflow_version_id", "=", workflowVersionId)
        .execute();
    } catch (err) {
      throw new RepositoryError(
        `Delete nodes for workflowVersionId=${workflowVersionId} failed`,
        err,
      );
    }
  },
};
