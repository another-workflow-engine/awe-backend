import type { Transaction } from "kysely";
import { db } from "../database.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import type { Context } from "../types/engine.js";
import { LogEventTypes, TaskStatuses } from "../types/enums.js";
import type { LogDetailSchema } from "../types/instanceLog.js";
import type { TaskExecutionModel } from "../types/models.js";
import { converterUtils } from "../utils/converter.utils.js";
import { eventLogService } from "./eventLog.service.js";
import type { DB } from "../types/database.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";

type ExecutionNodeStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "terminated"
  | "pending"
  | "discarded";

type ExecutionTimelineItem = {
  nodeId: string;
  nodeClientId: string;
  nodeType: string;
  nodeName: string | null;
  nodeConfiguration: unknown;
  order: number;
  status: ExecutionNodeStatus;
  startedOn: Date | null;
  endedOn: Date | null;
  inputVariables: unknown;
  outputVariables: unknown;
  userTaskExecutionId: string | null;
  taskId: string | null;
  outgoingConnections: {
    destinationNodeId: string | null;
    destinationNodeClientId: string | null;
    conditionExpression: string | null;
  }[];
};

const mapExecutionStatus = (status?: string | null): ExecutionNodeStatus => {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "in_progress") return "in_progress";
  if (status === "terminated") return "terminated";
  return "pending";
};

const getLatestTaskExecution = (
  nodeExecutions: Array<{
    id: string;
    task_id: string;
    status: string;
    started_on: Date | null;
    ended_on: Date | null;
    created_on: Date;
    input_variables: unknown;
    output_variables: unknown;
    user_task_execution_id: string | null;
  }>,
) => {
  if (nodeExecutions.length === 0) {
    return null;
  }

  return nodeExecutions[nodeExecutions.length - 1];
};

const computeNodeOrder = (
  nodes: { node_id: string; created_on: Date; node_type: string }[],
  connections: { source_node_id: string; destination_node_id: string | null }[],
): {
  orderByNodeId: Map<string, number>;
  levelByNodeId: Map<string, number>;
} => {
  const nodeById = new Map(nodes.map((n) => [n.node_id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const levelByNodeId = new Map<string, number>();

  for (const node of nodes) {
    inDegree.set(node.node_id, 0);
    adjacency.set(node.node_id, []);
  }

  for (const connection of connections) {
    if (!connection.destination_node_id) continue;
    if (!nodeById.has(connection.source_node_id)) continue;
    if (!nodeById.has(connection.destination_node_id)) continue;

    adjacency
      .get(connection.source_node_id)
      ?.push(connection.destination_node_id);
    inDegree.set(
      connection.destination_node_id,
      (inDegree.get(connection.destination_node_id) ?? 0) + 1,
    );
  }

  const zeroInDegreeNodes = nodes
    .filter((node) => (inDegree.get(node.node_id) ?? 0) === 0)
    .sort((a, b) => {
      if (a.node_type === "start" && b.node_type !== "start") return -1;
      if (a.node_type !== "start" && b.node_type === "start") return 1;
      return a.created_on.getTime() - b.created_on.getTime();
    })
    .map((node) => node.node_id);

  const queue = [...zeroInDegreeNodes];
  for (const id of queue) {
    if (!levelByNodeId.has(id)) {
      levelByNodeId.set(id, 0);
    }
  }

  const orderedNodeIds: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    orderedNodeIds.push(currentNodeId);

    const currentLevel = levelByNodeId.get(currentNodeId) ?? 0;

    for (const destinationId of adjacency.get(currentNodeId) ?? []) {
      inDegree.set(destinationId, (inDegree.get(destinationId) ?? 1) - 1);

      const nextLevel = currentLevel + 1;
      if ((levelByNodeId.get(destinationId) ?? -1) < nextLevel) {
        levelByNodeId.set(destinationId, nextLevel);
      }

      if ((inDegree.get(destinationId) ?? 0) === 0) {
        queue.push(destinationId);
      }
    }
  }

  const visited = new Set(orderedNodeIds);
  const remainingNodeIds = nodes
    .filter((node) => !visited.has(node.node_id))
    .sort((a, b) => a.created_on.getTime() - b.created_on.getTime())
    .map((node) => node.node_id);

  const allOrderedIds = [...orderedNodeIds, ...remainingNodeIds];
  const orderByNodeId = new Map<string, number>();
  allOrderedIds.forEach((nodeId, index) => {
    orderByNodeId.set(nodeId, index + 1);
    if (!levelByNodeId.has(nodeId)) {
      levelByNodeId.set(nodeId, 0);
    }
  });

  return { orderByNodeId, levelByNodeId };
};

export const taskExecutionService = {
  getByTaskId: async (taskId: string) => {
    return await taskExecutionRepository.findByTaskId(taskId);
  },

  getExecutionLogs: async (instanceId: string) => {
    const executionGraphData =
      await taskExecutionRepository.findExecutionGraphByInstanceId(instanceId);

    const { nodes, connections, executions } = executionGraphData;

    if (nodes.length === 0) {
      return {
        data: {
          executions: [],
        },
      };
    }

    const { orderByNodeId, levelByNodeId } = computeNodeOrder(
      nodes,
      connections,
    );

    const executionByNodeId = new Map<string, typeof executions>();
    for (const execution of executions) {
      const existing = executionByNodeId.get(execution.node_id) ?? [];
      existing.push(execution);
      executionByNodeId.set(execution.node_id, existing);
    }

    const outgoingConnectionsByNodeId = new Map<
      string,
      ExecutionTimelineItem["outgoingConnections"]
    >();
    for (const connection of connections) {
      const existing =
        outgoingConnectionsByNodeId.get(connection.source_node_id) ?? [];
      existing.push({
        destinationNodeId: connection.destination_node_id,
        destinationNodeClientId: connection.destination_node_client_id,
        conditionExpression: connection.condition_expression,
      });
      outgoingConnectionsByNodeId.set(connection.source_node_id, existing);
    }

    const orderedNodes = [...nodes].sort(
      (a, b) =>
        (orderByNodeId.get(a.node_id) ?? Number.MAX_SAFE_INTEGER) -
        (orderByNodeId.get(b.node_id) ?? Number.MAX_SAFE_INTEGER),
    );

    const sortedExecutions = [...executions].sort(
      (a, b) => a.created_on.getTime() - b.created_on.getTime(),
    );
    const execIndexById = new Map<string, number>();
    sortedExecutions.forEach((ex, idx) => execIndexById.set(ex.id, idx));

    const discardedNodeIds = new Set<string>();

    for (const node of nodes) {
      if (node.node_type === "decision") {
        const nodeExecs = executionByNodeId.get(node.node_id) ?? [];
        const latestExec = getLatestTaskExecution(nodeExecs);

        if (latestExec && latestExec.status === "completed") {
          const idx = execIndexById.get(latestExec.id);
          let takenDestinationId: string | null = null;
          if (idx !== undefined && idx < sortedExecutions.length - 1) {
            takenDestinationId = sortedExecutions[idx + 1]?.node_id ?? null;
          }

          const outConns = outgoingConnectionsByNodeId.get(node.node_id) ?? [];
          for (const conn of outConns) {
            if (
              conn.destinationNodeId &&
              conn.destinationNodeId !== takenDestinationId
            ) {
              // BFS to mark discarded
              const queue = [conn.destinationNodeId];
              while (queue.length > 0) {
                const cur = queue.shift()!;
                if (!executionByNodeId.has(cur) && !discardedNodeIds.has(cur)) {
                  discardedNodeIds.add(cur);
                  const curOuts = outgoingConnectionsByNodeId.get(cur) ?? [];
                  for (const co of curOuts) {
                    if (co.destinationNodeId) queue.push(co.destinationNodeId);
                  }
                }
              }
            }
          }
        }
      }
    }

    const executionItems: ExecutionTimelineItem[] = orderedNodes.map((node) => {
      const outgoingConnections =
        outgoingConnectionsByNodeId.get(node.node_id) ?? [];

      const nodeExecutions = executionByNodeId.get(node.node_id) ?? [];
      const latestTaskExecution = getLatestTaskExecution(nodeExecutions);

      let status = mapExecutionStatus(latestTaskExecution?.status);
      if (status === "pending" && discardedNodeIds.has(node.node_id)) {
        status = "discarded";
      }

      return {
        nodeId: node.node_id,
        nodeClientId: node.node_client_id,
        nodeType: node.node_type,
        nodeName: node.node_name,
        nodeConfiguration: node.node_configuration,
        order: orderByNodeId.get(node.node_id) ?? Number.MAX_SAFE_INTEGER,
        status: status,
        startedOn: latestTaskExecution?.started_on ?? null,
        endedOn: latestTaskExecution?.ended_on ?? null,
        inputVariables: latestTaskExecution?.input_variables ?? null,
        outputVariables: latestTaskExecution?.output_variables ?? null,
        userTaskExecutionId:
          latestTaskExecution?.user_task_execution_id ?? null,
        taskId: latestTaskExecution?.task_id ?? null,
        outgoingConnections,
      };
    });

    return {
      data: {
        executions: executionItems,
      },
    };
  },

  create: async (
    instanceId: string,
    taskId: string,
    inputVariables: Context,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const executeCallback = async (transaction: Transaction<DB>) => {
      const taskExecution = await taskExecutionRepository.insert(
        {
          task_id: taskId,
          status: TaskStatuses.IN_PROGRESS,
          input_variables: converterUtils.objectToJsonValue(inputVariables),
          started_on: new Date(),
        },
        transaction,
      );

      await eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecution.id,
        LogEventTypes.STARTED,
        undefined,
        undefined,
        transaction,
      );

      return taskExecution;
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },

  complete: async (
    instanceId: string,
    taskExecutionId: string,
    outputVariables: object,
    transaction: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.COMPLETED,
          output_variables: converterUtils.objectToJsonValue(outputVariables),
          ended_on: new Date(),
        },
        transaction,
      ),

      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.COMPLETED,
        undefined,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },

  fail: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    transaction: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.FAILED,
          ended_on: new Date(),
        },
        transaction,
      ),

      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.FAILED,
        details,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },

  terminate: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    transaction: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const [taskExecution] = await Promise.all([
      taskExecutionRepository.updateById(
        taskExecutionId,
        {
          status: TaskStatuses.TERMINATED,
          ended_on: new Date(),
        },
        transaction,
      ),

      eventLogService.createTaskExecutionLog(
        instanceId,
        taskExecutionId,
        LogEventTypes.TERMINATED,
        details,
        undefined,
        transaction,
      ),
    ]);

    return taskExecution;
  },
};
