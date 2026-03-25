import { db } from "../database.js";
import type { DB, Workflow } from "../types/database.js";
import type { Insertable, Transaction, Updateable } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { WorkflowModel, WorkflowVersionModel } from "../types/models.js";
import type {WorkflowVersionStatus} from "../types/database.js"

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

  findByEnvironmentIdWithLatestVersion: async (
  environemntId: string,
  transaction?: Transaction<DB>,
): Promise<
  {
    workflow: WorkflowModel;
    status: WorkflowVersionStatus | null;
    latestWorkflowVersion: number | null;
  }[]
> => {
  const dbConn = transaction ?? db;

  const workflows = await dbConn
    .selectFrom("workflow")
    .selectAll()
    .where("environment_id", "=", environemntId)
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

findByEnvironmentIdWithLatestVersionPaginated: async (
  environemntId: string,
  limit: number,
  offset: number,
  transaction?: Transaction<DB>,
): Promise<{
  items: Array<{
    workflow: WorkflowModel;
    status: WorkflowVersionStatus | null;
    latestWorkflowVersion: number | null;
  }>;
  total: number;
}> => {
  const dbConn = transaction ?? db;

  const workflows = await dbConn
    .selectFrom("workflow")
    .selectAll()
    .where("environment_id", "=", environemntId)
    .where("is_deleted", "=", false)
    .orderBy("workflow.created_on", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  const countResult = await dbConn
    .selectFrom("workflow")
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .where("environment_id", "=", environemntId)
    .where("is_deleted", "=", false)
    .executeTakeFirstOrThrow();

  const workflowIds = workflows.map((w) => w.id);

  if (workflowIds.length === 0) {
    return {
      items: [],
      total: countResult.count,
    };
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

  const items = workflows.map((wf) => {
    const versionInfo = versionMap.get(wf.id);

    return {
      workflow: wf,
      status: versionInfo?.status ?? null,
      latestWorkflowVersion: versionInfo?.version ?? null,
    };
  });

  return {
    items,
    total: countResult.count,
  };
},
};