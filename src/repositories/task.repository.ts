import { db } from "../database.js";
import type { TaskStatus } from "../types/database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  DbTransaction,
  InstanceModel,
  NodeModel,
  TaskExecutionModel,
  TaskModel,
} from "../types/models.js";
import { columnMapper } from "./utils/columnMapper.util.js";
import {
  instanceColumns,
  nodeColumns,
  taskColumns,
  taskExecutionColumns,
} from "../types/columnNames.js";
import type { NewTask, UpdateTask } from "../types/task.js";

export const taskRepository = {
  findById: async (
    id: string,
    transaction?: DbTransaction,
  ): Promise<TaskModel | undefined> => {
    try {
      return await (transaction ?? db)
        .selectFrom("task")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    } catch (err) {
      throw new RepositoryError(`Find task by id=${id} failed`, err);
    }
  },

  findByStatusAndInstanceId: async (
    instanceId: string,
    status: TaskStatus,
    transaction?: DbTransaction,
  ): Promise<TaskModel | undefined> => {
    return await (transaction ?? db)
      .selectFrom("task")
      .selectAll()
      .where("instance_id", "=", instanceId)
      .where("status", "=", status)
      .executeTakeFirst();
  },

  findByIdAndEnvironmentIdsWithRelations: async (
    taskId: string,
    environmentIds: string[],
  ): Promise<
    | {
        task: TaskModel;
        node: NodeModel;
        instance: InstanceModel;
      }
    | undefined
  > => {
    if (environmentIds.length === 0) {
      return undefined;
    }

    const result = await db
      .selectFrom("task")
      .innerJoin("node", "node.id", "task.node_id")
      .innerJoin("instance", "instance.id", "task.instance_id")
      .innerJoin(
        "workflow_version",
        "workflow_version.id",
        "instance.workflow_version_id",
      )
      .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns(eb, "task", taskColumns),
        ...columnMapper.prefixedColumns(eb, "node", nodeColumns),
        ...columnMapper.prefixedColumns(eb, "instance", instanceColumns),
      ])
      .where("workflow.environment_id", "in", environmentIds)
      .where("task.id", "=", taskId)
      .executeTakeFirst();

    if (!result) {
      return result;
    }

    return {
      task: columnMapper.extractPrefixed<TaskModel>(result, "task"),
      node: columnMapper.extractPrefixed<NodeModel>(result, "node"),
      instance: columnMapper.extractPrefixed<InstanceModel>(result, "instance"),
    };
  },

  findLatestByInstanceIdWithRelations: async (instanceId: string) => {
    const result = await db
      .selectFrom("task")
      .innerJoin("task_execution", "task_execution.task_id", "task.id")
      .innerJoin("node", "node.id", "task.node_id")
      .select((eb) => [
        ...columnMapper.prefixedColumns<TaskModel>(eb, "task", taskColumns),
        ...columnMapper.prefixedColumns<TaskExecutionModel>(
          eb,
          "task_execution",
          taskExecutionColumns,
        ),
        ...columnMapper.prefixedColumns<NodeModel>(eb, "node", nodeColumns),
      ])
      .where("task.instance_id", "=", instanceId)
      .orderBy("task_execution.created_on", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!result) {
      return result;
    }

    return {
      task: columnMapper.extractPrefixed<TaskModel>(result, "task"),
      taskExecution: columnMapper.extractPrefixed<TaskExecutionModel>(
        result,
        "task_execution",
      ),
      node: columnMapper.extractPrefixed<NodeModel>(result, "node"),
    };
  },

  insert: async (
    data: NewTask,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    try {
      return await (transaction ?? db)
        .insertInto("task")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task insert failed", err);
    }
  },

  updateById: async (
    id: string,
    data: UpdateTask,
    transaction?: DbTransaction,
  ): Promise<TaskModel> => {
    try {
      return await (transaction ?? db)
        .updateTable("task")
        .set(data)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Task update failed", err);
    }
  },
};
