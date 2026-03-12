import { db } from "../database.js";
import type { DB, Workflow } from "../types/database.js";
import type { Insertable, Transaction, Updateable } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { WorkflowModel, WorkflowVersionModel } from "../types/models.js";

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
      .select(["workflow_id", dbConn.fn.max("version").as("max_version")])
      .where("workflow_id", "in", workflowIds)
      .where("is_deleted", "=", false)
      .groupBy("workflow_id")
      .execute();

    const versionMap = new Map(
      versions.map((v) => [
        v.workflow_id,
        v.max_version !== null ? Number(v.max_version) : null,
      ]),
    );

    return workflows.map((wf) => ({
      workflow: wf,
      latestWorkflowVersion: versionMap.get(wf.id) ?? null,
    }));
  },
};
