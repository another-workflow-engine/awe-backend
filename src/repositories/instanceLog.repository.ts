import type { Insertable, Transaction } from "kysely";
import type { DB, InstanceLog } from "../types/database.js";
import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type {
  InstanceEntityType,
  InstanceEventType,
} from "../types/database.js";
import { LogEventTypes, TaskStatuses } from "../types/enums.js";

export type NewInstanceLog = Insertable<InstanceLog>;

export const instanceLogRepository = {
  insert: async (data: NewInstanceLog, transaction?: Transaction<DB>) => {
    try {
      return await (transaction ?? db)
        .insertInto("instance_log")
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      throw new RepositoryError("Insert instance log failed", err);
    }
  },

  getInstanceHistory: async (
    instanceId: string,
    filters?: {
      entityTypes?: InstanceEntityType[];
      createdBy?: string;
      eventTypes?: InstanceEventType[];
    },
    sortOrder: "asc" | "desc" = "asc",
  ) => {
    try {
      let query = db
        .selectFrom("instance_log")
        .select((eb) => [
          eb.ref("id").as("id"),
          eb.ref("instance_id").as("instanceId"),
          eb.ref("entity_type").as("entityType"),
          eb.ref("entity_id").as("entityId"),
          eb.ref("event_type").as("eventType"),
          eb.ref("details").as("details"),
          eb.ref("created_by").as("createdBy"),
          eb.ref("created_on").as("createdOn"),
        ])
        .where("instance_id", "=", instanceId);

      if (filters?.entityTypes) {
        query = query.where("entity_type", "in", filters.entityTypes);
      }
      if (filters?.eventTypes) {
        query = query.where("event_type", "in", filters.eventTypes);
      }
      if (filters?.createdBy) {
        query = query.where("created_by", "=", filters.createdBy);
      }

      return await query.orderBy("created_on", sortOrder).execute();
    } catch (err) {
      throw new RepositoryError(
        "Find instance logs by instance ID failed",
        err,
      );
    }
  },

  getInstanceAudit: async (instanceId: string, environmentIds: string[]) => {
    try {
      if (environmentIds.length === 0) {
        return null;
      }

      const logs = await db
        .selectFrom("instance_log")
        .innerJoin("instance", "instance.id", "instance_log.instance_id")
        .innerJoin(
          "workflow_version",
          "workflow_version.id",
          "instance.workflow_version_id",
        )
        .innerJoin("workflow", "workflow.id", "workflow_version.workflow_id")
        .selectAll("instance_log")
        .where("instance_log.instance_id", "=", instanceId)
        .where("workflow.environment_id", "in", environmentIds)
        .orderBy("instance_log.created_on", "asc")
        .execute();

      if (logs.length === 0) return null;

      const instanceRow = await db
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
          eb.ref("workflow.id").as("workflow_id"),
        ])
        .where("instance.id", "=", instanceId)
        .where("workflow.environment_id", "in", environmentIds)
        .executeTakeFirst();

      if (!instanceRow) return null;
      const taskLogRows = logs.filter((l) => l.entity_type === "task");
      const taskExecutionLogRows = logs.filter(
        (l) => l.entity_type === "task_execution",
      );

      const taskIds = [...new Set(taskLogRows.map((l) => l.entity_id))];
      const taskExecutionIds = [
        ...new Set(taskExecutionLogRows.map((l) => l.entity_id)),
      ];

      type TaskInfo = {
        id: string;
        status: string;
        node_type: string;
        node_name: string | null;
        node_client_id: string;
        created_on: Date;
      };

      let taskInfoMap = new Map<string, TaskInfo>();

      if (taskIds.length > 0) {
        const taskRows = await db
          .selectFrom("task")
          .innerJoin("node", "node.id", "task.node_id")
          .select((eb) => [
            eb.ref("task.id").as("id"),
            eb.ref("task.status").as("status"),
            eb.ref("task.created_on").as("created_on"),
            eb.ref("node.type").as("node_type"),
            eb.ref("node.name").as("node_name"),
            eb.ref("node.client_id").as("node_client_id"),
          ])
          .where("task.id", "in", taskIds)
          .execute();

        for (const t of taskRows) {
          taskInfoMap.set(t.id, t as unknown as TaskInfo);
        }
      }

      type ExecInfo = {
        id: string;
        task_id: string;
        status: string;
        started_on: Date | null;
        ended_on: Date | null;
        input_variables: unknown;
        output_variables: unknown;
        created_on: Date;
      };

      let execInfoMap = new Map<string, ExecInfo>();

      if (taskExecutionIds.length > 0) {
        const execRows = await db
          .selectFrom("task_execution")
          .select([
            "id",
            "task_id",
            "status",
            "started_on",
            "ended_on",
            "input_variables",
            "output_variables",
            "created_on",
          ])
          .where("id", "in", taskExecutionIds)
          .execute();

        for (const ex of execRows) {
          execInfoMap.set(ex.id, ex as unknown as ExecInfo);
        }
      }

      const status = instanceRow.status;
      const completedAt = status === "completed" ? instanceRow.ended_on : null;
      const failedAt = status === "failed" ? instanceRow.ended_on : null;
      const terminatedAt =
        status === "terminated" ? instanceRow.ended_on : null;

      const seenTaskIds: string[] = [];
      const taskMessages = new Map<string, string[]>();
      const taskErrors = new Map<string, string[]>();

      for (const log of taskLogRows) {
        if (!seenTaskIds.includes(log.entity_id)) {
          seenTaskIds.push(log.entity_id);
        }
        const det = log.details as any;
        if (det?.message) {
          if (!taskMessages.has(log.entity_id))
            taskMessages.set(log.entity_id, []);
          taskMessages.get(log.entity_id)!.push(det.message);
        }
        if (det?.error) {
          if (!taskErrors.has(log.entity_id)) taskErrors.set(log.entity_id, []);
          taskErrors
            .get(log.entity_id)!
            .push(
              typeof det.error === "string"
                ? det.error
                : JSON.stringify(det.error),
            );
        }
      }

      const executionsByTaskId = new Map<string, ExecInfo[]>();
      const executionMessages = new Map<string, string[]>();
      const executionErrors = new Map<string, string[]>();

      for (const execLog of taskExecutionLogRows) {
        const exec = execInfoMap.get(execLog.entity_id);
        if (!exec) continue;

        if (!executionsByTaskId.has(exec.task_id)) {
          executionsByTaskId.set(exec.task_id, []);
        }
        const bucket = executionsByTaskId.get(exec.task_id)!;
        if (!bucket.find((e) => e.id === exec.id)) {
          bucket.push(exec);
        }

        const det = execLog.details as any;
        if (det?.message) {
          if (!executionMessages.has(exec.id))
            executionMessages.set(exec.id, []);
          executionMessages.get(exec.id)!.push(det.message);
        }
        if (det?.error) {
          if (!executionErrors.has(exec.id)) executionErrors.set(exec.id, []);
          executionErrors
            .get(exec.id)!
            .push(
              typeof det.error === "string"
                ? det.error
                : JSON.stringify(det.error),
            );
        }
      }

      const totalTasksCount = seenTaskIds.length;

      const taskStatusBreakdown = {
        completed: 0,
        failed: 0,
        in_progress: 0,
        terminated: 0,
      };

      for (const taskId of seenTaskIds) {
        const info = taskInfoMap.get(taskId);
        if (info?.status && taskStatusBreakdown.hasOwnProperty(info.status)) {
          (taskStatusBreakdown as any)[info.status]++;
        }
      }

      let totalExecutionsCount = 0;
      for (const log of taskExecutionLogRows) {
        if (
          log?.event_type === LogEventTypes.STARTED ||
          log?.event_type === LogEventTypes.RETRIED
        ) {
          totalExecutionsCount++;
        }
      }

      let durationMs: number | null = null;
      if (instanceRow.created_on && instanceRow.ended_on) {
        durationMs =
          new Date(instanceRow.ended_on).getTime() -
          new Date(instanceRow.created_on).getTime();
      }

      return {
        instance: {
          id: instanceRow.id,
          workflowId: (instanceRow as any).workflow_id,
          workflowName: (instanceRow as any).workflow_name,
          versionNumber: (instanceRow as any).version_number,
          workflowVersionId: instanceRow.workflow_version_id,
          currentStatus: instanceRow.status,
          completedAt,
          failedAt,
          terminatedAt,
          autoAdvance: instanceRow.auto_advance,
          inputVariables: instanceRow.input_variables,
          outputVariables: instanceRow.output_variables,
          currentVariables: instanceRow.current_variables,
          createdBy: instanceRow.created_by,
          createdOn: instanceRow.created_on,
          totalTasks: totalTasksCount,
          taskStatusBreakdown,
          totalExecutions: totalExecutionsCount,
          durationMs,
        },
        taskLog: seenTaskIds.map((taskId) => {
          const info = taskInfoMap.get(taskId);
          const executions = executionsByTaskId.get(taskId) ?? [];

          return {
            id: taskId,
            nodeId: info?.node_client_id ?? taskId,
            nodeName: info?.node_name ?? null,
            taskType: info?.node_type ?? "unknown",
            currentStatus: info?.status ?? "unknown",
            createdOn: info?.created_on ?? null,
            message: taskMessages.get(taskId)?.pop() ?? null,
            error: taskErrors.get(taskId)?.pop() ?? null,
            taskExecutionLog: executions
              .sort(
                (a, b) =>
                  new Date(a.created_on).getTime() -
                  new Date(b.created_on).getTime(),
              )
              .map((ex) => ({
                id: ex.id,
                taskId: ex.task_id,
                status: ex.status,
                startedOn: ex.started_on,
                endedOn: ex.ended_on,
                createdOn: ex.created_on,
                inputVariables: ex.input_variables,
                outputVariables: ex.output_variables,
                message: executionMessages.get(ex.id)?.pop() ?? null,
                error: executionErrors.get(ex.id)?.pop() ?? null,
              })),
          };
        }),
      };
    } catch (err) {
      throw new RepositoryError("Get instance audit failed", err);
    }
  },
};
