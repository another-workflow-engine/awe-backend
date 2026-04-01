import type { Transaction } from "kysely";
import { db } from "../database";
import { taskExecutionRepository } from "../repositories/taskExecution.repository";
import type { ContextVariables } from "../types/engine";
import { LogEventTypes, TaskStatuses } from "../types/enums";
import type { LogDetailSchema } from "../types/instanceLog";
import type { TaskExecutionModel, TaskModel } from "../types/models";
import { converterUtils } from "../utils/converter.utils";
import { eventLogService } from "./eventLog.service";
import type { DB } from "../types/database";

type ExecutionNodeStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "terminated"
  | "pending";

type ExecutionFlowNode = {
  nodeId: string;
  nodeClientId: string;
  nodeType: string;
  nodeName: string | null;
  nodeConfiguration: unknown;
  order: number;
  level: number;
  status: ExecutionNodeStatus;
  isExecuted: boolean;
  taskExecution: TaskExecutionModel | null;
};

type ExecutionFlowConnection = {
  sourceNodeId: string;
  destinationNodeId: string | null;
  destinationNodeClientId: string | null;
  conditionExpression: string | null;
};

type ExecutionTimelineItem = {
  nodeId: string;
  nodeClientId: string;
  nodeType: string;
  nodeName: string | null;
  order: number;
  status: ExecutionNodeStatus;
  startedOn: Date | null;
  endedOn: Date | null;
  inputVariables: unknown;
  outputVariables: unknown;
  outgoingConnections: {
    destinationNodeId: string | null;
    destinationNodeClientId: string | null;
    conditionExpression: string | null;
  }[];
};

const getNodeStatusFromExecutions = (statuses: string[]): ExecutionNodeStatus => {
  if (statuses.length === 0) {
    return "pending";
  }

  const latestStatus = statuses[statuses.length - 1];

  if (latestStatus === "completed") return "completed";
  if (latestStatus === "failed") return "failed";
  if (latestStatus === "in_progress") return "in_progress";
  if (latestStatus === "terminated") return "terminated";

  return "pending";
};

const toTimelineStatus = (status: string): ExecutionNodeStatus => {
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
): { orderByNodeId: Map<string, number>; levelByNodeId: Map<string, number> } => {
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

    adjacency.get(connection.source_node_id)?.push(connection.destination_node_id);
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
  getExecutionLogs: async (instanceId: string) => {
    const executionGraphData =
      await taskExecutionRepository.findExecutionGraphByInstanceId(instanceId);

    const { nodes, connections, executions } = executionGraphData;
    const { orderByNodeId, levelByNodeId } = computeNodeOrder(nodes, connections);

    const executionByNodeId = new Map<string, typeof executions>();
    for (const execution of executions) {
      const existing = executionByNodeId.get(execution.node_id) ?? [];
      existing.push(execution);
      executionByNodeId.set(execution.node_id, existing);
    }

    const workflowNodes: ExecutionFlowNode[] = nodes
      .map((node) => {
        const nodeExecutions = executionByNodeId.get(node.node_id) ?? [];
        const latestExecution = nodeExecutions[nodeExecutions.length - 1] ?? null;
        const nodeStatus = getNodeStatusFromExecutions(
          nodeExecutions.map((item) => item.status),
        );

        return {
          nodeId: node.node_id,
          nodeClientId: node.node_client_id,
          nodeType: node.node_type,
          nodeName: node.node_name,
          nodeConfiguration: node.node_configuration,
          order: orderByNodeId.get(node.node_id) ?? Number.MAX_SAFE_INTEGER,
          level: levelByNodeId.get(node.node_id) ?? 0,
          status: nodeStatus,
          isExecuted: nodeExecutions.length > 0,
          taskExecution: latestExecution,
        };
      })
      .sort((a, b) => a.order - b.order);

    const workflowConnections: ExecutionFlowConnection[] = connections.map(
      (connection) => ({
        sourceNodeId: connection.source_node_id,
        destinationNodeId: connection.destination_node_id,
        destinationNodeClientId: connection.destination_node_client_id,
        conditionExpression: connection.condition_expression,
      }),
    );

    const outgoingConnectionsByNodeId = new Map<string, ExecutionFlowConnection[]>();
    for (const connection of workflowConnections) {
      const existing = outgoingConnectionsByNodeId.get(connection.sourceNodeId) ?? [];
      existing.push(connection);
      outgoingConnectionsByNodeId.set(connection.sourceNodeId, existing);
    }

    const executionItems: ExecutionTimelineItem[] = workflowNodes.map((node) => {
      const outgoingConnections =
        outgoingConnectionsByNodeId.get(node.nodeId)?.map((connection) => ({
          destinationNodeId: connection.destinationNodeId,
          destinationNodeClientId: connection.destinationNodeClientId,
          conditionExpression: connection.conditionExpression,
        })) ?? [];

      const nodeExecutions = executionByNodeId.get(node.nodeId) ?? [];
      const latestTaskExecution = getLatestTaskExecution(nodeExecutions);
      const timelineStatus = toTimelineStatus(node.status);

      return {
        nodeId: node.nodeId,
        nodeClientId: node.nodeClientId,
        nodeType: node.nodeType,
        nodeName: node.nodeName,
        order: node.order,
        status: timelineStatus,
        startedOn: latestTaskExecution?.started_on ?? null,
        endedOn: latestTaskExecution?.ended_on ?? null,
        inputVariables: latestTaskExecution?.input_variables ?? null,
        outputVariables: latestTaskExecution?.output_variables ?? null,
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
    task: TaskModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const executeCallback = async (transaction: Transaction<DB>) => {
      const taskExecution = await taskExecutionRepository.insert(
        {
          task_id: task.id,
          status: TaskStatuses.IN_PROGRESS,
          input_variables: converterUtils.objectToJsonValue(inputVariables),
          started_on: new Date(),
        },
        transaction,
      );

      await eventLogService.createTaskExecutionLog(
        task.instance_id,
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
  ): Promise<TaskExecutionModel> => {
    return await db.transaction().execute(async (transaction) => {
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
    });
  },

  fail: async (
    instanceId: string,
    taskExecutionId: string,
    details: LogDetailSchema,
    error?: Error,
  ): Promise<TaskExecutionModel> => {
    return await db.transaction().execute(async (transaction) => {
      const [taskExecution] = await Promise.all([
        taskExecutionRepository.updateById(
          taskExecutionId,
          {
            status: TaskStatuses.FAILED,
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
    });
  },
};
