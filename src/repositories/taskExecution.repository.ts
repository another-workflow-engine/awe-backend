import { db } from "../database.js";
import type { DB, TaskExecution } from "../types/database.js";
import type { Insertable, Updateable, Transaction } from "kysely";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { TaskExecutionModel } from "../types/models.js";

type NewTaskExecution = Insertable<TaskExecution>;
type UpdateTaskExecution = Updateable<TaskExecution>;

export type TaskExecutionWithNode = TaskExecutionModel & {
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  node_configuration: unknown;
};

export const taskExecutionRepository = {
  insert: async (
    data: NewTaskExecution,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("task_execution")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task execution insert failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateTaskExecution,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    try {
      return await (transaction ?? db)
        .updateTable("task_execution")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task execution update failed", err);
    }
  },

  findByInstanceId: async (
    instanceId: string,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionWithNode[]> => {
    try {
      return (await (transaction ?? db)
        .selectFrom("task_execution")
        .innerJoin("task", "task.id", "task_execution.task_id")
        .innerJoin("node", "node.id", "task.node_id")
        .selectAll("task_execution")
        .select((eb) => [
          eb.ref("node.id").as("node_id"),
          eb.ref("node.client_id").as("node_client_id"),
          eb.ref("node.type").as("node_type"),
          eb.ref("node.name").as("node_name"),
          eb.ref("node.configuration").as("node_configuration"),
        ])
        .where("task.instance_id", "=", instanceId)
        .orderBy("task_execution.created_on", "asc")
        .execute()) as unknown as TaskExecutionWithNode[];
    } catch (err) {
      throw new RepositoryError(
        `Find task executions by instance_id=${instanceId} failed`,
        err,
      );
    }
  },
};
