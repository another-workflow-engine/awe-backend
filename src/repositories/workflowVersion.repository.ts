import { sql, type Insertable, type Updateable } from "kysely";
import type {
  WorkflowVersion,
  WorkflowVersionStatus,
} from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  DbTransaction,
  NodeModel,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import { NodeTypes, WorkflowVersionStatuses } from "../types/enums.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  nodeColumns,
  workflowColumns,
  workflowVersionColumns,
} from "../types/columnNames.js";

export type NewWorkflowVersion = Insertable<WorkflowVersion>;
export type UpdateWorkflowVersion = Updateable<WorkflowVersion>;

export const workflowVersionRepository = {
  findById: async (id: string, transaction?: DbTransaction) => {
    return await (transaction ?? db)
      .selectFrom("workflow_version")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByIdWithWorkflow: async (
    id: string,
  ): Promise<
    | {
        workflowVersion: WorkflowVersionModel;
        workflow: WorkflowModel;
      }
    | undefined
  > => {
    const result = await db
      .selectFrom("workflow_version")
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<WorkflowVersionModel>(
          eb,
          "workflow_version",
          workflowVersionColumns,
        ),
        ...columnMapper.prefixedColumns<WorkflowModel>(
          eb,
          "workflow",
          workflowColumns,
        ),
      ])
      .where("workflow_version.id", "=", id)
      .where("workflow_version.is_deleted", "=", false)
      .where("workflow.is_deleted", "=", false)
      .executeTakeFirst();

    if (!result) {
      return result;
    }

    return {
      workflowVersion: columnMapper.extractPrefixed<WorkflowVersionModel>(
        result,
        "workflow_version",
      ),
      workflow: columnMapper.extractPrefixed<WorkflowModel>(result, "workflow"),
    };
  },

  findLatestNonNullVersionByWorkflowId: async (
    workflowId: string,
    transaction: DbTransaction,
  ) => {
    return await (transaction ?? db)
      .selectFrom("workflow_version")
      .selectAll()
      .where("workflow_id", "=", workflowId)
      .where("is_deleted", "=", false)
      .where("version", "is not", null)
      .orderBy("modified_on", "desc")
      .limit(1)
      .executeTakeFirst();
  },

  findByWorkflowId: async (
    id: string,
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
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
        total: Number(countResult.count),
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
    version: string,
    transaction?: DbTransaction,
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

  findActiveVersionByWorkflowIdWithRelations: async (
    workflowId: string,
  ): Promise<
    | {
        workflow: WorkflowModel;
        workflowVersion: WorkflowVersionModel;
        startNode: NodeModel;
      }
    | undefined
  > => {
    const result = await db
      .selectFrom("workflow_version")
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .innerJoin("node", "node.workflow_version_id", "workflow_version.id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<WorkflowModel>(
          eb,
          "workflow",
          workflowColumns,
        ),
        ...columnMapper.prefixedColumns<WorkflowVersionModel>(
          eb,
          "workflow_version",
          workflowVersionColumns,
        ),
        ...columnMapper.prefixedColumns<NodeModel>(eb, "node", nodeColumns),
      ])
      .where("workflow_version.workflow_id", "=", workflowId)
      .where("workflow_version.status", "=", WorkflowVersionStatuses.ACTIVE)
      .where("workflow_version.is_deleted", "=", false)
      .where("node.type", "=", NodeTypes.START)
      .limit(1)
      .executeTakeFirst();

    if (!result) {
      return result;
    }

    return {
      workflow: columnMapper.extractPrefixed<WorkflowModel>(result, "workflow"),
      workflowVersion: columnMapper.extractPrefixed<WorkflowVersionModel>(
        result,
        "workflow_version",
      ),
      startNode: columnMapper.extractPrefixed<NodeModel>(result, "node"),
    };
  },

  insert: async (
    data: {
      version: string | null;
      description: string | null;
      created_by: string;
      modified_by: string;
      status: WorkflowVersionStatus;
      workflow_id: string;
    },
    transaction?: DbTransaction,
  ) => {
    try {
      return await (transaction ?? db)
        .insertInto("workflow_version")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert workflow version failed", err);
    }
  },

  insertNextVersion: async (
    data: {
      description: string | null;
      created_by: string;
      modified_by: string;
      status: WorkflowVersionStatus;
      workflow_id: string;
    },
    transaction?: DbTransaction,
  ) => {
    try {
      return await (transaction ?? db)
        .insertInto("workflow_version")
        .values({
          ...data,
          version: sql<string>`
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
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
  ) => {
    return await (transaction ?? db)
      .updateTable("workflow_version")
      .set({ status: WorkflowVersionStatuses.PUBLISHED })
      .where("workflow_id", "=", workflowId)
      .where("status", "=", WorkflowVersionStatuses.ACTIVE)
      .where("is_deleted", "=", false)
      .execute();
  },

  draftOrValidVersionExists: async (
    workflowId: string,
    transaction?: DbTransaction,
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
