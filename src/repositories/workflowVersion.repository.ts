import {
  sql,
  type Insertable,
  type Transaction,
  type Updateable,
} from "kysely";
import type { DB, WorkflowVersion } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { WorkflowVersionModel } from "../types/models.js";
import { WorkflowVersionStatuses } from "../types/enums.js";

export type NewWorkflowVersion = Insertable<WorkflowVersion>;
export type UpdateWorkflowVersion = Updateable<WorkflowVersion>;

export const workflowVersionRepository = {
  findByWorkflowId: async (
    id: string,
    transaction?: Transaction<DB>,
  ): Promise<WorkflowVersionModel[]> => {
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
  ): Promise<WorkflowVersionModel> => {
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

  findActiveVersionByWorkflowId: async (
    workflowId: string,
    transaction?: Transaction<DB>,
  ): Promise<WorkflowVersionModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("workflow_version")
      .selectAll()
      .where("workflow_id", "=", workflowId)
      .where("status", "=", WorkflowVersionStatuses.ACTIVE)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
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

  updateById: async (
    id: string,
    data: UpdateWorkflowVersion,
    transaction?: Transaction<DB>,
  ): Promise<WorkflowVersionModel> => {
    try {
      return await (transaction ?? db)
        .updateTable("workflow_version")
        .set({ ...data })
        .where("id", "=", id)
        .where("is_deleted", "=", false)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Update workflow version failed", err);
    }
  },

  demoteActiveVersionToPublished: async (
    workflowId: string,
    transaction?: Transaction<DB>,
  ) => {
    return await (transaction ?? db)
      .updateTable("workflow_version")
      .set({ status: WorkflowVersionStatuses.PUBLISHED })
      .where("workflow_id", "=", workflowId)
      .where("status", "=", WorkflowVersionStatuses.ACTIVE)
      .where("is_deleted", "=", false)
      .execute();
  },
};
