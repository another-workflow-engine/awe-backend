import { sql, type Insertable, type Transaction } from "kysely";
import type { DB, WorkflowVersion } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";

export type NewWorkflowVersion = Insertable<WorkflowVersion>;

export const workflowVersionRepository = {
  findByWorkflowId: async (id: string, transaction?: Transaction<DB>) => {
    try {
      return await (transaction ?? db)
        .selectFrom("workflow_version")
        .selectAll()
        .where("workflow_id", "=", id)
        .where("is_deleted", "=", false)
        .execute();
    } catch (err) {
      throw new RepositoryError(
        `Workflow versions search for workflowId=${id} failed`,
        err,
      );
    }
  },

  findByWorkflowIdAndVersion: async (
    workflowId: string,
    version: number,
    transaction?: Transaction<DB>,
  ) => {
    try {
      return await (transaction ?? db)
        .selectFrom("workflow_version")
        .selectAll()
        .where("workflow_id", "=", workflowId)
        .where("version", "=", version)
        .where("is_deleted", "=", false)
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError(
        `Workflow version search for workflowId=${workflowId} and version=${version} failed`,
        err,
      );
    }
  },

  insertNextVersion: async (
    data: NewWorkflowVersion,
    transaction?: Transaction<DB>,
  ) => {
    try {
      return await (transaction ?? db)
        .insertInto("workflow_version")
        .values({
          ...data,
          version: sql<number>`
      coalesce(
        (
          select max(version) + 1
          from workflow_version
          where workflow_id = ${data.workflow_id}
        ),
        1
      )
    `,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert workflow version failed", err);
    }
  },
};
