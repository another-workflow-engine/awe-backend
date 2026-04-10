import { type Insertable, type Transaction, type Updateable } from "kysely";
import type { DB, Instance, TaskStatus } from "../types/database.js";
import type {
  InstanceModel,
  TaskExecutionModel,
  TaskModel,
} from "../types/models.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { TaskStatuses } from "../types/enums.js";

export type NewInstance = Insertable<Instance>;
export type UpdateInstance = Updateable<Instance>;

export type InstanceListItem = InstanceModel & {
  version_number: number | null;
  workflow_name: string;
};

export type LockedInProgressOrPausedRelations = {
  instance: InstanceModel | undefined;
  task: TaskModel | undefined;
  taskExecution: TaskExecutionModel | undefined;
};

export const instanceRepository = {
  findAll: async (
    actorId: string,
    environmentIds: string[],
  ): Promise<InstanceListItem[]> => {
    if (environmentIds.length === 0) {
      return [];
    }

    try {
      return (await db
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .selectAll("instance")
        .select((eb) => [
          eb.ref("workflow_version.version").as("version_number"),
          eb.ref("workflow.name").as("workflow_name"),
        ])
        .where("workflow.created_by", "=", actorId)
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .orderBy("instance.created_on", "desc")
        .execute()) as unknown as InstanceListItem[];
    } catch (err) {
      throw new RepositoryError("Find all instances failed", err);
    }
  },

  findWithPagination: async (
    actorId: string,
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
      const items = (await db
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .selectAll("instance")
        .select((eb) => [
          eb.ref("workflow_version.version").as("version_number"),
          eb.ref("workflow.name").as("workflow_name"),
        ])
        .where("workflow.created_by", "=", actorId)
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .orderBy("instance.created_on", "desc")
        .limit(limit)
        .offset(offset)
        .execute()) as unknown as InstanceListItem[];

      const countResult = await db
        .selectFrom("instance")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .select((eb) => eb.fn.count<number>("instance.id").as("count"))
        .where("workflow.created_by", "=", actorId)
        .where("workflow.environment_id", "in", environmentIds)
        .where("instance.is_deleted", "=", false)
        .executeTakeFirstOrThrow();

      return {
        items,
        total: countResult.count,
      };
    } catch (err) {
      throw new RepositoryError("Find instances with pagination failed", err);
    }
  },

  findById: async (
    id: string,
    transaction?: Transaction<DB>,
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
    transaction: Transaction<DB>,
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

  findByIdAndEnvironmentIds: async (
    id: string,
    environmentIds: string[],
    transaction?: Transaction<DB>,
  ): Promise<InstanceModel | undefined> => {
    if (environmentIds.length === 0) {
      return undefined;
    }

    return await (transaction ?? db)
      .selectFrom("instance")
      .innerJoin(
        "workflow_version",
        "workflow_version.id",
        "instance.workflow_version_id",
      )
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .selectAll("instance")
      .where("instance.id", "=", id)
      .where("workflow.environment_id", "in", environmentIds)
      .where("instance.is_deleted", "=", false)
      .where("workflow_version.is_deleted", "=", false)
      .where("workflow.is_deleted", "=", false)
      .executeTakeFirst();
  },

  insert: async (data: NewInstance, transaction?: Transaction<DB>) => {
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
    transaction?: Transaction<DB>,
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
