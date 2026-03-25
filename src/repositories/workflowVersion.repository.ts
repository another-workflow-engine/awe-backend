import {
  sql,
  type Insertable,
  type Transaction,
  type Updateable,
} from "kysely";
import type {
  DB,
  WorkflowVersion,
  WorkflowVersionStatus,
} from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { WorkflowVersionModel } from "../types/models.js";
import { WorkflowVersionStatuses } from "../types/enums.js";

export type NewWorkflowVersion = Insertable<WorkflowVersion>;
export type UpdateWorkflowVersion = Updateable<WorkflowVersion>;

export const workflowVersionRepository = {
  findById: async (id: string) => {
    return await db
      .selectFrom("workflow_version")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

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

  findByWorkflowIdPaginated: async (
    workflowId: string,
    limit: number,
    offset: number,
    transaction?: Transaction<DB>,
  ): Promise<{ items: WorkflowVersionModel[]; total: number }> => {
    try {
      const dbConn = transaction ?? db;

      const items = await dbConn
        .selectFrom("workflow_version")
        .selectAll()
        .where("workflow_id", "=", workflowId)
        .where("is_deleted", "=", false)
        .orderBy("version", "desc")
        .limit(limit)
        .offset(offset)
        .execute();

      const countResult = await dbConn
        .selectFrom("workflow_version")
        .select((eb) => eb.fn.count<number>("id").as("count"))
        .where("workflow_id", "=", workflowId)
        .where("is_deleted", "=", false)
        .executeTakeFirstOrThrow();

      return {
        items,
        total: countResult.count,
      };
    } catch (err) {
      throw new RepositoryError(
        `Workflow versions paginated search failed for workflowId=${workflowId}`,
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
    data: {
      description: string | null;
      created_by: string;
      modified_by: string;
      status: WorkflowVersionStatus;
      workflow_id: string;
    },
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

  doesDraftOrValidVersionExists: async (
    workflowId: string,
    transaction?: Transaction<DB>,
  ): Promise<boolean> => {
    const result = await (transaction ?? db)
      .selectFrom("workflow_version")
      .select(sql<number>`count(*)`.as("count"))
      .where("workflow_id", "=", workflowId)
      .where("status", "in", [
        WorkflowVersionStatuses.DRAFT,
        WorkflowVersionStatuses.VALID,
      ])
      .where("is_deleted", "=", false)
      .executeTakeFirst();
    
    return result ? result.count > 0 : false;
  },
};
