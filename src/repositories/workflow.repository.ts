import { db } from "../database.js";
import type { DB, Workflow } from "../types/database.js";
import type { Insertable, Transaction, Updateable } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { WorkflowModel } from "../types/models.js";
import type { WorkflowVersionStatus } from "../types/database.js";

type NewWorkflow = Insertable<Workflow>;
type UpdateWorkflow = Updateable<Workflow>;

export const workflowRepository = {
  findById: async (id: string, transaction?: Transaction<DB>) => {
    return await (transaction ?? db)
      .selectFrom("workflow")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByIdAndEnvironmentIds: async (
    id: string,
    environmentIds: string[],
    transaction?: Transaction<DB>,
  ) => {
    return await (transaction ?? db)
      .selectFrom("workflow")
      .selectAll()
      .where("id", "=", id)
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByBaseWorkflowIdAndEnvironmentId: async (
    baseWorkflowId: string,
    environmentId: string,
    transaction?: Transaction<DB>,
  ) => {
    return await (transaction ?? db)
      .selectFrom("workflow")
      .selectAll()
      .where("base_workflow_id", "=", baseWorkflowId)
      .where("environment_id", "=", environmentId)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  insert: async (
    data: NewWorkflow,
    transaction?: Transaction<DB>,
  ): Promise<WorkflowModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("workflow")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Workflow insert failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateWorkflow,
    transaction?: Transaction<DB>,
  ) => {
    try {
      return await (transaction ?? db)
        .updateTable("workflow")
        .set({ ...data })
        .where("id", "=", id)
        .where("is_deleted", "=", false)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Update workflow failed", err);
    }
  },

  findByEnvironmentIdsWithLatestVersion: async (
    environmentIds: string[],
    transaction?: Transaction<DB>,
  ): Promise<
    {
      workflow: WorkflowModel;
      status: WorkflowVersionStatus | null;
      latestWorkflowVersion: number | null;
    }[]
  > => {
    if (environmentIds.length === 0) {
      return [];
    }

    const dbConn = transaction ?? db;

    const workflows = await dbConn
      .selectFrom("workflow")
      .selectAll()
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .execute();

    const workflowIds = workflows.map((w) => w.id);

    if (workflowIds.length === 0) {
      return [];
    }

    const versions = await dbConn
      .selectFrom("workflow_version")
      .select(["workflow_id", "version", "status"])
      .where("workflow_id", "in", workflowIds)
      .where("is_deleted", "=", false)
      .distinctOn("workflow_id")
      .orderBy("workflow_id")
      .orderBy("version", "desc")
      .execute();

    const versionMap = new Map(
      versions.map((v) => [
        v.workflow_id,
        {
          version: Number(v.version),
          status: v.status,
        },
      ]),
    );

    return workflows.map((wf) => {
      const versionInfo = versionMap.get(wf.id);

      return {
        workflow: wf,
        status: versionInfo?.status ?? null,
        latestWorkflowVersion: versionInfo?.version ?? null,
      };
    });
  },

  countByEnvironmentIds: async (
    environmentIds: string[],
    transaction?: Transaction<DB>,
  ): Promise<number> => {
    if (environmentIds.length === 0) {
      return 0;
    }

    const result = await (transaction ?? db)
      .selectFrom("workflow")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .executeTakeFirstOrThrow();

    return Number(result.count);
  },

  findByEnvironmentIdsWithLatestVersionPaginated: async (
    environmentIds: string[],
    limit: number,
    offset: number,
    search?: string,
    createdSort: "asc" | "desc" = "desc",
    transaction?: Transaction<DB>,
  ): Promise<{
    items: Array<{
      workflow: WorkflowModel;
      status: WorkflowVersionStatus | null;
      latestVersionId: string | null;
      latestVersionNumber: number | null;
    }>;
    total: number;
  }> => {
    if (environmentIds.length === 0) {
      return { items: [], total: 0 };
    }

    const dbConn = transaction ?? db;

    const normalizedSearch = search?.trim();
    let workflowsQuery = dbConn
      .selectFrom("workflow")
      .selectAll()
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false);

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      workflowsQuery = workflowsQuery.where((eb) =>
        eb.or([
          eb("workflow.name", "ilike", searchPattern),
          eb("workflow.description", "ilike", searchPattern),
        ]),
      );
    }

    const workflows = await workflowsQuery
      .orderBy("workflow.created_on", createdSort)
      .limit(limit)
      .offset(offset)
      .execute();

    let countQuery = dbConn
      .selectFrom("workflow")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false);

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb("workflow.name", "ilike", searchPattern),
          eb("workflow.description", "ilike", searchPattern),
        ]),
      );
    }

    const countResult = await countQuery.executeTakeFirstOrThrow();

    const workflowIds = workflows.map((w) => w.id);

    if (workflowIds.length === 0) {
      return {
        items: [],
        total: Number(countResult.count),
      };
    }

    const versions = await dbConn
      .selectFrom("workflow_version")
      .select(["workflow_id", "id", "version", "status"])
      .where("workflow_id", "in", workflowIds)
      .where("is_deleted", "=", false)
      .distinctOn("workflow_id")
      .orderBy("workflow_id")
      .orderBy("version", "desc")
      .execute();

    const versionMap = new Map(
      versions.map((v) => [
        v.workflow_id,
        {
          version: Number(v.version),
          status: v.status,
          id: v.id,
        },
      ]),
    );

    const items = workflows.map((wf) => {
      const versionInfo = versionMap.get(wf.id);

      return {
        workflow: wf,
        status: versionInfo?.status ?? null,
        latestVersionId: versionInfo?.id ?? null,
        latestVersionNumber: versionInfo?.version ?? null,
      };
    });

    return {
      items,
      total: Number(countResult.count),
    };
  },
};
