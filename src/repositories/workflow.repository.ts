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
      latestWorkflowVersion: WorkflowVersionModel | null;
    }[]
  > => {
    const latestVersions = (transaction ?? db)
      .selectFrom("workflow_version")
      .select([
        "workflow_id",
        (transaction ?? db).fn.max("version").as("max_version"),
      ])
      .where("is_deleted", "=", false)
      .groupBy("workflow_id")
      .as("latest_workflow_version");

    const results = await (transaction ?? db)
      .selectFrom("workflow")
      .leftJoin("workflow_version", (join) =>
        join
          .onRef("workflow_version.workflow_id", "=", "workflow.id")
          .on("workflow_version.is_deleted", "=", false),
      )
      .leftJoin(latestVersions, (join) =>
        join
          .onRef(
            "latest_workflow_version.workflow_id",
            "=",
            "workflow_version.workflow_id",
          )
          .onRef(
            "latest_workflow_version.max_version",
            "=",
            "workflow_version.version",
          ),
      )
      .select((eb) => [
        eb.ref("workflow.id").as("workflow_id"),
        eb.ref("workflow.environment_id").as("workflow_environment_id"),
        eb.ref("workflow.name").as("workflow_name"),
        eb.ref("workflow.description").as("workflow_description"),

        eb.ref("workflow.created_on").as("workflow_created_on"),
        eb.ref("workflow.created_by").as("workflow_created_by"),

        eb.ref("workflow.modified_on").as("workflow_modified_on"),
        eb.ref("workflow.modified_by").as("workflow_modified_by"),

        eb.ref("workflow.is_deleted").as("workflow_is_deleted"),
        eb.ref("workflow.deleted_on").as("workflow_deleted_on"),
        eb.ref("workflow.deleted_by").as("workflow_deleted_by"),

        eb.ref("workflow_version.id").as("workflow_version_id"),
        eb
          .ref("workflow_version.workflow_id")
          .as("workflow_version_workflow_id"),

        eb.ref("workflow_version.version").as("workflow_version_version"),
        eb
          .ref("workflow_version.description")
          .as("workflow_version_description"),
        eb.ref("workflow_version.status").as("workflow_version_status"),

        eb.ref("workflow_version.created_on").as("workflow_version_created_on"),
        eb.ref("workflow_version.created_by").as("workflow_version_created_by"),

        eb
          .ref("workflow_version.modified_on")
          .as("workflow_version_modified_on"),
        eb
          .ref("workflow_version.modified_by")
          .as("workflow_version_modified_by"),
        eb
          .ref("workflow_version.published_on")
          .as("workflow_version_published_on"),
        eb.ref("workflow_version.is_deleted").as("workflow_version_is_deleted"),
        eb.ref("workflow_version.deleted_on").as("workflow_version_deleted_on"),
        eb.ref("workflow_version.deleted_by").as("workflow_version_deleted_by"),
      ])
      .where("workflow.environment_id", "=", environemntId)
      .where("workflow.is_deleted", "=", false)
      .execute();

    return results.map((row) => {
      return {
        workflow: {
          id: row.workflow_id,
          environment_id: row.workflow_environment_id,
          name: row.workflow_name,
          description: row.workflow_description,
          created_on: row.workflow_created_on,
          created_by: row.workflow_created_by,
          modified_on: row.workflow_modified_on,
          modified_by: row.workflow_modified_by,
          is_deleted: row.workflow_is_deleted,
          deleted_on: row.workflow_deleted_on,
          deleted_by: row.workflow_deleted_by,
        },
        latestWorkflowVersion: row.workflow_version_id
          ? {
              id: row.workflow_version_id,
              workflow_id: row.workflow_version_workflow_id!,
              version: row.workflow_version_version!,
              description: row.workflow_version_description,
              status: row.workflow_version_status!,
              created_on: row.workflow_version_created_on!,
              created_by: row.workflow_version_created_by!,
              modified_on: row.workflow_version_modified_on!,
              modified_by: row.workflow_version_modified_by!,
              is_deleted: row.workflow_version_is_deleted!,
              deleted_on: row.workflow_version_deleted_on,
              deleted_by: row.workflow_version_deleted_by,
              published_on: row.workflow_version_published_on,
            }
          : null,
      };
    });
  },
};
