import { sql } from "kysely";
import type { WorkflowVersionStatus } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  ActorModel,
  DbTransaction,
  NodeModel,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import { NodeTypes, WorkflowVersionStatuses } from "../types/enums.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  actorColumns,
  nodeColumns,
  workflowColumns,
  workflowVersionColumns,
} from "../types/columnNames.js";
import type {
  UpdateWorkflowVersion,
  WorkflowVersionListItem,
} from "../types/workflowVersion.js";

export const workflowVersionRepository = {
  findByIdWithWorkflow: async (
    id: string,
  ): Promise<
    | {
        workflowVersion: WorkflowVersionModel;
        workflow: WorkflowModel;
        modifierActor: ActorModel;
      }
    | undefined
  > => {
    const result = await db
      .selectFrom("workflow_version")
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .innerJoin("actor", "actor.id", "workflow_version.modified_by")
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
        ...columnMapper.prefixedColumns<ActorModel>(eb, "actor", actorColumns),
      ])
      .where("workflow_version.id", "=", id)
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
      modifierActor: columnMapper.extractPrefixed<ActorModel>(result, "actor"),
    };
  },

  findLatestNonNullVersionByWorkflowId: async (workflowId: string) => {
    return await db
      .selectFrom("workflow_version")
      .selectAll()
      .where("workflow_id", "=", workflowId)
      .where("version", "is not", null)
      .orderBy("modified_on", "desc")
      .limit(1)
      .executeTakeFirst();
  },

  findByWorkflowIdPaginated: async (data: {
    workflowId: string;
    offset: number;
    limit: number;
    environmentIds: string[];
  }): Promise<{ items: WorkflowVersionListItem[]; total: number }> => {
    const results = await db
      .selectFrom("workflow_version")
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .innerJoin("actor", "actor.id", "workflow_version.modified_by")
      .select((eb) => [
        eb.ref("workflow_version.id").as("id"),
        eb.ref("workflow_version.version").as("version"),
        eb.ref("workflow_version.description").as("description"),
        eb.ref("workflow_version.status").as("status"),
        eb.ref("workflow_version.published_on").as("published_on"),
        eb.ref("workflow_version.modified_on").as("modified_on"),

        eb.ref("actor.type").as("actor_type"),

        eb.fn.countAll().over().as("total_count"),
      ])
      .where("workflow.id", "=", data.workflowId)
      .where("workflow.environment_id", "in", data.environmentIds)
      .orderBy("version", "desc")
      .limit(data.limit)
      .offset(data.offset)
      .execute();

    return {
      total: results[0] ? Number(results[0].total_count) : 0,
      items: results.map((res) => {
        return {
          id: res.id,
          version: res.version,
          description: res.description,
          status: res.status,
          publishedAt: res.published_on,
          modifiedAt: res.modified_on,
          modifiedBy: res.actor_type,
        };
      }),
    };
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
      .where("workflow.is_deleted", "=", false)
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
      .execute();
  },

  versionsWithStatusExistsByWorkflowId: async (
    workflowId: string,
    statuses: WorkflowVersionStatus[],
    transaction?: DbTransaction,
  ): Promise<boolean> => {
    if (statuses.length === 0) {
      return false;
    }

    const result = await (transaction ?? db)
      .selectFrom("workflow_version")
      .select("id")
      .where("workflow_id", "=", workflowId)
      .where("status", "in", statuses)
      .limit(1)
      .executeTakeFirst();

    return !!result;
  },
};
