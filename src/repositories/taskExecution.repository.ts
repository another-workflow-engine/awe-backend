import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import {
  taskExecutionColumns,
  userTaskExecutionColumns,
} from "../types/columnNames.js";
import type {
  DbTransaction,
  TaskExecutionModel,
  UserTaskExecutionModel,
} from "../types/models.js";
import type {
  ExecutionGraphConnection,
  ExecutionGraphNode,
  ExecutionSequenceData,
  ExecutionSequenceExecution,
} from "../types/nodePath.js";
import type { NewTaskExecution, UpdateTaskExecution } from "../types/task.js";
import { columnMapper } from "./utils/columnMapper.util.js";

export const taskExecutionRepository = {
  findByTaskId: async (
    taskId: string,
    transaction?: DbTransaction,
  ): Promise<TaskExecutionModel[]> => {
    return await (transaction ?? db)
      .selectFrom("task_execution")
      .selectAll()
      .where("task_id", "=", taskId)
      .execute();
  },

  findByTaskIdWithUserTask: async (
    taskId: string,
    transaction?: DbTransaction,
  ) => {
    const results = await (transaction ?? db)
      .selectFrom("task_execution")
      .leftJoin(
        "user_task_execution",
        "user_task_execution.task_execution_id",
        "task_execution.id",
      )
      .select((eb) => [
        ...columnMapper.prefixedColumns(
          eb,
          "task_execution",
          taskExecutionColumns,
        ),
        ...columnMapper.prefixedColumns(
          eb,
          "user_task_execution",
          userTaskExecutionColumns,
        ),
      ])
      .where("task_id", "=", taskId)
      .execute();

    return results.map((res) => {
      return {
        taskExecution: columnMapper.extractPrefixed<TaskExecutionModel>(
          res,
          "task_execution",
        ),
        userTaskExecution: res["user_task_execution__id"]
          ? columnMapper.extractPrefixed<UserTaskExecutionModel>(
              res,
              "user_task_execution",
            )
          : undefined,
      };
    });
  },

  insert: async (
    data: NewTaskExecution,
    transaction?: DbTransaction,
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
    transaction?: DbTransaction,
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

  findExecutionSequenceDataByInstanceId: async (
    instanceId: string,
    transaction?: DbTransaction,
  ): Promise<ExecutionSequenceData> => {
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
          .execute() as Promise<ExecutionGraphNode[]>,

        conn
          .selectFrom("edge as e")
          .innerJoin("node as source", "source.id", "e.source_node_id")
          .leftJoin(
            "node as destination",
            "destination.id",
            "e.destination_node_id",
          )
          .select((eb) => [
            eb.ref("e.client_id").as("condition_expression"),
            eb.ref("e.source_node_id").as("source_node_id"),
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
          .execute() as Promise<ExecutionGraphConnection[]>,

        conn
          .selectFrom("task_execution")
          .innerJoin("task", "task.id", "task_execution.task_id")
          .innerJoin("node", "node.id", "task.node_id")
          .leftJoin(
            "user_task_execution",
            "user_task_execution.task_execution_id",
            "task_execution.id",
          )
          .select((eb) => [
            eb.ref("task_execution.id").as("id"),
            eb.ref("task_execution.task_id").as("task_id"),
            eb.ref("task_execution.status").as("status"),
            eb.ref("task_execution.created_on").as("started_on"),
            eb.ref("task_execution.ended_on").as("ended_on"),
            eb.ref("task_execution.created_on").as("created_on"),
            eb.ref("node.id").as("node_id"),
            eb.ref("node.client_id").as("node_client_id"),
            eb.ref("node.type").as("node_type"),
            eb.ref("node.name").as("node_name"),
            eb
              .ref("user_task_execution.task_execution_id")
              .as("user_task_execution_id"),
          ])
          .where("task.instance_id", "=", instanceId)
          .orderBy("task_execution.created_on", "asc")
          .execute() as Promise<ExecutionSequenceExecution[]>,
      ]);

      return {
        nodes,
        connections,
        executions,
      };
    } catch (err) {
      throw new RepositoryError(
        `Find execution sequence data by instance_id=${instanceId} failed`,
        err,
      );
    }
  },

  findLatestUserTaskExecutionByTaskExecutionId: async (
    taskExecutionId: string,
    transaction?: DbTransaction,
  ): Promise<TaskExecutionModel | null> => {
    try {
      const result = await (transaction ?? db)
        .selectFrom("user_task_execution")
        .innerJoin(
          "task_execution",
          "task_execution.id",
          "user_task_execution.task_execution_id",
        )
        .selectAll("task_execution")
        .where("task_execution.id", "=", taskExecutionId)
        .executeTakeFirst();

      return result ?? null;
    } catch (err) {
      throw new RepositoryError(
        `Find latest user task execution by task_execution_id=${taskExecutionId} failed`,
        err,
      );
    }
  },
};
