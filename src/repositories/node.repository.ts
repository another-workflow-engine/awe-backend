import type { Insertable, Transaction } from "kysely";
import type { DB, Node } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { db } from "../database.js";
import type { NodeModel } from "../types/models.js";

export type NewNode = Insertable<Node>;

export const nodeRepository = {
  findByWorkflowVersionId: async (
    id: string,
    transaction?: Transaction<DB>,
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

  insert: async (
    data: NewNode,
    transaction?: Transaction<DB>,
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
    transaction?: Transaction<DB>,
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

  softDeleteByWorkflowVersionId: async (
    workflowVersionId: string,
    transaction?: Transaction<DB>,
  ): Promise<NodeModel[]> => {
    try {
      return await (transaction ?? db)
        .updateTable("node")
        .set({ is_deleted: true })
        .where("workflow_version_id", "=", workflowVersionId)
        .where("is_deleted", "=", false)
        .returningAll()
        .execute();
    } catch (err) {
      throw new RepositoryError(
        `Soft delete nodes for workflowVersionId=${workflowVersionId} failed`,
        err,
      );
    }
  },

  deleteByWorkflowVersionId: async (
    workflowVersionId: string,
    transaction?: Transaction<DB>,
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
