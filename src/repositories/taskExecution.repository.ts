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
  user_task_execution_id: string | null;
};

export type WorkflowNodeForExecution = {
  node_configuration: any;
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  created_on: Date;
};

export type TaskExecutionForGraph = TaskExecutionModel & {
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  user_task_execution_id: string | null;
};

export type WorkflowConnectionForExecution = {
  edge_id: string;
  edge_client_id: string;
  condition_expression: string | null;
  source_node_id: string;
  source_node_client_id: string;
  destination_node_id: string | null;
  destination_node_client_id: string | null;
};

export type ExecutionGraphData = {
  nodes: WorkflowNodeForExecution[];
  connections: WorkflowConnectionForExecution[];
  executions: TaskExecutionForGraph[];
};

export const taskExecutionRepository = {
  findByTaskId: async (
    taskId: string,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel[]> => {
    return await (transaction ?? db)
      .selectFrom("task_execution")
      .selectAll()
      .where("task_id", "=", taskId)
      .execute();
  },

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

  findExecutionGraphByInstanceId: async (
    instanceId: string,
    transaction?: Transaction<DB>,
  ): Promise<ExecutionGraphData> => {
    try {
      const conn = transaction ?? db;

      const instance = await conn
        .selectFrom("instance")
        .select(["workflow_version_id"])
        .where("id", "=", instanceId)
        .where("is_deleted", "=", false)
        .executeTakeFirst();

      if (!instance) {
        return { nodes: [], connections: [], executions: [] };
      }

      const [nodes, connections, executions] = await Promise.all([
        conn
          .selectFrom("node")
          .select((eb) => [
            eb.ref("node.id").as("node_id"),
            eb.ref("node.client_id").as("node_client_id"),
            eb.ref("node.type").as("node_type"),
            eb.ref("node.name").as("node_name"),
            eb.ref("node.created_on").as("created_on"),
          ])
          .where("node.workflow_version_id", "=", instance.workflow_version_id)
          .where("node.is_deleted", "=", false)
          .orderBy("node.created_on", "asc")
          .execute() as Promise<WorkflowNodeForExecution[]>,

        conn
          .selectFrom("edge as e")
          .innerJoin("node as source", "source.id", "e.source_node_id")
          .leftJoin(
            "node as destination",
            "destination.id",
            "e.destination_node_id",
          )
          .select((eb) => [
            eb.ref("e.id").as("edge_id"),
            eb.ref("e.client_id").as("edge_client_id"),
            eb.ref("e.condition_expression").as("condition_expression"),
            eb.ref("e.source_node_id").as("source_node_id"),
            eb.ref("source.client_id").as("source_node_client_id"),
            eb.ref("e.destination_node_id").as("destination_node_id"),
            eb.ref("destination.client_id").as("destination_node_client_id"),
          ])
          .where(
            "source.workflow_version_id",
            "=",
            instance.workflow_version_id,
          )
          .where("e.is_deleted", "=", false)
          .orderBy("e.created_on", "asc")
          .execute() as Promise<WorkflowConnectionForExecution[]>,

        conn
          .selectFrom("task_execution")
          .innerJoin("task", "task.id", "task_execution.task_id")
          .innerJoin("node", "node.id", "task.node_id")
          .leftJoin(
            "user_task_execution",
            "user_task_execution.task_execution_id",
            "task_execution.id",
          )
          .selectAll("task_execution")
          .select((eb) => [
            eb.ref("node.id").as("node_id"),
            eb.ref("node.client_id").as("node_client_id"),
            eb.ref("node.type").as("node_type"),
            eb.ref("node.name").as("node_name"),
            eb.ref("user_task_execution.id").as("user_task_execution_id"),
          ])
          .where("task.instance_id", "=", instanceId)
          .orderBy("task_execution.created_on", "asc")
          .execute() as Promise<TaskExecutionForGraph[]>,
      ]);

      return {
        nodes,
        connections,
        executions,
      };
    } catch (err) {
      throw new RepositoryError(
        `Find execution graph by instance_id=${instanceId} failed`,
        err,
      );
    }
  },
};
