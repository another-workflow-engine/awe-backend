import type { Insertable, Updateable } from "kysely";
import type {
  ActorType,
  EnvironmentType,
  Instance,
  InstanceControlSignal,
  InstanceStatus,
} from "../types/database.js";
import type {
  DbTransaction,
  InstanceModel,
  TaskExecutionModel,
  TaskModel,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { TaskStatuses } from "../types/enums.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  instanceColumns,
  workflowColumns,
  workflowVersionColumns,
} from "../types/columnNames.js";
import type {
  InstanceListItem,
  LockedInProgressOrPausedRelations,
  NewInstance,
  UpdateInstance,
} from "../types/instance.js";

export const instanceRepository = {
  findWithPagination: async (
    environmentIds: string[],
    limit: number,
    offset: number,
  ): Promise<{
    items: InstanceListItem[];
    total: number;
  }> => {
    if (environmentIds.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    try {
      const results = await db
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .innerJoin("environment", "environment.id", "workflow.environment_id")
        .innerJoin("actor", "actor.id", "instance.created_by")
        .select((eb) => [
          eb.ref("instance.id").as("instance_id"),
          eb.ref("instance.status").as("instance_status"),
          eb.ref("instance.control_signal").as("instance_control_signal"),
          eb.ref("instance.auto_advance").as("instance_auto_advance"),
          eb.ref("instance.ended_on").as("instance_ended_on"),
          eb.ref("instance.created_on").as("instance_created_on"),

          eb.ref("actor.type").as("actor_type"),

          eb.ref("environment.type").as("environment_type"),

          eb.ref("workflow.id").as("workflow_id"),
          eb.ref("workflow.name").as("workflow_name"),

          eb.ref("workflow_version.id").as("workflow_version_id"),
          eb.ref("workflow_version.version").as("workflow_version_version"),

          eb.fn.countAll().over().as("total_count"),
        ])
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .orderBy("instance.created_on", "desc")
        .limit(limit)
        .offset(offset)
        .execute();

      return {
        items: results.map((result) => {
          return {
            id: result.instance_id,
            status: result.instance_status,
            controlSignal: result.instance_control_signal,
            autoAdvance: result.instance_auto_advance,
            startedAt: result.instance_created_on,
            endedAt: result.instance_ended_on,
            createdBy: result.actor_type,

            workflow: {
              id: result.workflow_id,
              name: result.workflow_name,

              versionId: result.workflow_version_id,
              version: result.workflow_version_version,
            },

            environment: result.environment_type,
          };
        }),
        total: Number(results[0]?.total_count ?? 0),
      };
    } catch (err) {
      throw new RepositoryError("Instance pagination failed", err);
    }
  },

  countByEnvironmentIds: async (
    environmentIds: string[],
    transaction?: DbTransaction,
  ): Promise<number> => {
    if (environmentIds.length === 0) {
      return 0;
    }

    try {
      const result = await (transaction ?? db)
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .select((eb) => eb.fn.count<number>("instance.id").as("count"))
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .where("workflow_version.is_deleted", "=", false)
        .where("workflow.is_deleted", "=", false)
        .executeTakeFirstOrThrow();

      return Number(result.count);
    } catch (err) {
      throw new RepositoryError("Count instances by environment failed", err);
    }
  },

  countByEnvironmentIdsAndStatus: async (
    environmentIds: string[],
    status: InstanceStatus,
    transaction?: DbTransaction,
  ): Promise<number> => {
    if (environmentIds.length === 0) {
      return 0;
    }

    try {
      const result = await (transaction ?? db)
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .select((eb) => eb.fn.count<number>("instance.id").as("count"))
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .where("workflow_version.is_deleted", "=", false)
        .where("workflow.is_deleted", "=", false)
        .where("instance.status", "=", status)
        .executeTakeFirstOrThrow();

      return Number(result.count);
    } catch (err) {
      throw new RepositoryError(
        "Count instances by environment and status failed",
        err,
      );
    }
  },

  findRecentByEnvironmentIds: async (
    environmentIds: string[],
    limit: number,
    transaction?: DbTransaction,
  ): Promise<InstanceListItem[]> => {
    if (environmentIds.length === 0) {
      return [];
    }

    try {
      return (await (transaction ?? db)
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .innerJoin("environment", "environment.id", "workflow.environment_id")
        .selectAll("instance")
        .select((eb) => [
          eb.ref("workflow_version.version").as("version_number"),
          eb.ref("workflow.name").as("workflow_name"),
          eb.ref("environment.type").as("environment"),
        ])
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .where("workflow_version.is_deleted", "=", false)
        .where("workflow.is_deleted", "=", false)
        .where("environment.is_deleted", "=", false)
        .orderBy("instance.created_on", "desc")
        .limit(limit)
        .execute()) as unknown as InstanceListItem[];
    } catch (err) {
      throw new RepositoryError(
        "Find recent instances by environment failed",
        err,
      );
    }
  },

  findById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<InstanceModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("instance")
      .selectAll()
      .where("id", "=", id)
      .where("is_deleted", "=", false)
      .executeTakeFirst();
  },

  getLockedInProgressOrPausedRelationsById: async (
    instanceId: string,
    transaction: DbTransaction,
  ): Promise<LockedInProgressOrPausedRelations> => {
    const returnObject: LockedInProgressOrPausedRelations = {
      instance: undefined,
      task: undefined,
      taskExecution: undefined,
    };

    returnObject.instance = await transaction
      .selectFrom("instance")
      .selectAll()
      .where("id", "=", instanceId)
      .forUpdate()
      .executeTakeFirst();

    if (!returnObject.instance) {
      return returnObject;
    }

    returnObject.task = await transaction
      .selectFrom("task")
      .selectAll()
      .where("instance_id", "=", instanceId)
      .where("status", "in", [TaskStatuses.IN_PROGRESS, TaskStatuses.PAUSED])
      .forUpdate()
      .executeTakeFirst();

    if (!returnObject.task) {
      return returnObject;
    }

    returnObject.taskExecution = await transaction
      .selectFrom("task_execution")
      .selectAll()
      .where("task_id", "=", returnObject.task.id)
      .where("status", "=", TaskStatuses.IN_PROGRESS)
      .forUpdate()
      .executeTakeFirst();

    return returnObject;
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    id: string,
    environmentIds: string[],
  ): Promise<
    | {
        instance: InstanceModel;
        workflowVersion: WorkflowVersionModel;
        workflow: WorkflowModel;
      }
    | undefined
  > => {
    if (environmentIds.length === 0) {
      return undefined;
    }

    const result = await db
      .selectFrom("instance")
      .innerJoin(
        "workflow_version",
        "workflow_version.id",
        "instance.workflow_version_id",
      )
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<InstanceModel>(
          eb,
          "instance",
          instanceColumns,
        ),
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
      .where("instance.id", "=", id)
      .where("workflow.environment_id", "in", environmentIds)
      .where("instance.is_deleted", "=", false)
      .limit(1)
      .executeTakeFirst();

    if (!result) {
      return result;
    }

    return {
      instance: columnMapper.extractPrefixed<InstanceModel>(result, "instance"),
      workflow: columnMapper.extractPrefixed<WorkflowModel>(result, "workflow"),
      workflowVersion: columnMapper.extractPrefixed<WorkflowVersionModel>(
        result,
        "workflow_version",
      ),
    };
  },

  insert: async (data: NewInstance, transaction?: DbTransaction) => {
    try {
      return await (transaction ?? db)
        .insertInto("instance")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert instance failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateInstance,
    transaction?: DbTransaction,
  ): Promise<InstanceModel> => {
    try {
      return await (transaction ?? db)
        .updateTable("instance")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Update instance failed", err);
    }
  },
};
