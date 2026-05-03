import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  ActorModel,
  DbTransaction,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type { CreatedSort } from "../types/enums.js";
import type {
  NewWorkflow,
  UpdateWorkflow,
  WorkflowListItem,
} from "../types/workflow.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  actorColumns,
  workflowColumns,
  workflowVersionColumns,
} from "../types/columnNames.js";

export const workflowRepository = {
  findById: async (id: string, transaction?: DbTransaction) => {
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
    transaction?: DbTransaction,
  ) => {
    return await (transaction ?? db)
      .selectFrom("workflow")
      .selectAll()
      .where("id", "=", id)
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    workflowId: string,
    environmentIds: string[],
  ): Promise<
    | {
        workflow: WorkflowModel;
        latestVersion: WorkflowVersionModel | null;
        lastModifier: ActorModel;
      }
    | undefined
  > => {
    if (environmentIds.length === 0) {
      return;
    }

    const result = await db
      .selectFrom("workflow")
      .innerJoin("actor", "actor.id", "workflow.modified_by")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("workflow_version")
            .selectAll()
            .whereRef("workflow_version.workflow_id", "=", "workflow.id")
            .orderBy("workflow_version.modified_on", "desc")
            .limit(1)
            .as("workflow_version"),
        (join) => join.onTrue(),
      )
      .select((eb) => [
        ...columnMapper.prefixedColumns(eb, "workflow", workflowColumns),
        ...columnMapper.prefixedColumns(
          eb,
          "workflow_version",
          workflowVersionColumns,
        ),
        ...columnMapper.prefixedColumns(eb, "actor", actorColumns),
      ])
      .where("workflow.id", "=", workflowId)
      .where("workflow.is_deleted", "=", false)
      .where("workflow.environment_id", "in", environmentIds)
      .executeTakeFirst();

    if (!result) {
      return;
    }

    return {
      workflow: columnMapper.extractPrefixed(result, "workflow"),
      latestVersion: result.workflow_version__id
        ? columnMapper.extractPrefixed(result, "workflow_version")
        : null,
      lastModifier: columnMapper.extractPrefixed(result, "actor"),
    };
  },

  findByBaseWorkflowIdAndEnvironmentId: async (
    baseWorkflowId: string,
    environmentId: string,
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
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

  updateByIdAndEnvironmentIds: async (
    id: string,
    data: UpdateWorkflow,
    environmentIds: string[],
  ): Promise<WorkflowModel | undefined> => {
    if (environmentIds.length === 0) {
      return;
    }
    
    return await db
      .updateTable("workflow")
      .set(data)
      .where("id", "=", id)
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .returningAll()
      .executeTakeFirst();
  },

  countByEnvironmentIds: async (
    environmentIds: string[],
    transaction?: DbTransaction,
  ): Promise<number> => {
    if (environmentIds.length === 0) {
      return 0;
    }

    const result = await (transaction ?? db)
      .selectFrom("workflow")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("environment_id", "in", environmentIds)
      .where("is_deleted", "=", false)
      .executeTakeFirst();

    return result ? Number(result.count) : 0;
  },

  findByWithLatestVersionPaginated: async (data: {
    offset: number;
    limit: number;
    search: string | undefined;
    createdSort: CreatedSort;
    environmentIds: string[];
  }): Promise<{
    items: WorkflowListItem[];
    total: number;
  }> => {
    if (data.environmentIds.length === 0) {
      return { items: [], total: 0 };
    }

    const normalizedSearch = data.search?.trim();
    let workflowsQuery = db
      .selectFrom("workflow")
      .innerJoin("environment", "environment.id", "workflow.environment_id")
      .innerJoin("actor", "actor.id", "workflow.modified_by")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("workflow_version")
            .select([
              "workflow_version.id",
              "workflow_version.workflow_id",
              "workflow_version.version",
              "workflow_version.status",
            ])
            .whereRef("workflow_version.workflow_id", "=", "workflow.id")
            .orderBy("workflow_version.modified_on", "desc")
            .limit(1)
            .as("latest_version"),
        (join) => join.onTrue(),
      )
      .select((eb) => [
        eb.ref("workflow.id").as("workflow_id"),
        eb.ref("workflow.name").as("workflow_name"),
        eb.ref("workflow.description").as("workflow_description"),
        eb.ref("workflow.modified_on").as("workflow_modified_on"),

        eb.ref("latest_version.id").as("workflow_version_id"),
        eb.ref("latest_version.version").as("workflow_version_version"),
        eb.ref("latest_version.status").as("workflow_version_status"),

        eb.ref("environment.type").as("environment_type"),
        eb.ref("actor.type").as("actor_type"),
        eb.fn.countAll().over().as("total_count"),
      ])
      .orderBy("workflow.created_on", data.createdSort)
      .limit(data.limit)
      .offset(data.offset)
      .where("workflow.environment_id", "in", data.environmentIds)
      .where("workflow.is_deleted", "=", false);

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      workflowsQuery = workflowsQuery.where((eb) =>
        eb.or([
          eb("workflow.name", "ilike", searchPattern),
          eb("workflow.description", "ilike", searchPattern),
        ]),
      );
    }

    const results = await workflowsQuery.execute();

    return {
      total: results[0] ? Number(results[0].total_count) : 0,
      items: results.map((res) => {
        const id = res.workflow_version_id;
        const version = res.workflow_version_version;
        const status = res.workflow_version_status;

        return {
          id: res.workflow_id,
          name: res.workflow_name,
          description: res.workflow_description,
          environment: res.environment_type,
          modifiedAt: res.workflow_modified_on,
          modifiedBy: res.actor_type,

          latestVersion:
            id && version && status ? { id, version, status } : null,
        };
      }),
    };
  },
};
