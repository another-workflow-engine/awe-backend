import type {
  ExecutionGraphConnection,
  ExecutionGraphNode,
  ExecutionNodeStatus,
  ExecutionSequenceExecution,
  ExecutionSequenceItem,
} from "../types/nodePath.js";

const mapExecutionStatus = (status?: string | null): ExecutionNodeStatus => {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "in_progress") return "in_progress";
  if (status === "terminated") return "terminated";
  return "pending";
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTime = (value: Date | string | null | undefined): number => {
  return toDate(value)?.getTime() ?? 0;
};

const getLatestTaskExecution = <T extends { created_on: Date | string }>(
  nodeExecutions: T[],
) => {
  if (nodeExecutions.length === 0) {
    return null;
  }

  return nodeExecutions[nodeExecutions.length - 1] ?? null;
};

const computeNodeOrder = (
  nodes: ExecutionGraphNode[],
  connections: ExecutionGraphConnection[],
): {
  orderByNodeId: Map<string, number>;
  levelByNodeId: Map<string, number>;
} => {
  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
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

  const queue = nodes
    .filter((node) => (inDegree.get(node.node_id) ?? 0) === 0)
    .sort((a, b) => toTime(a.created_on) - toTime(b.created_on))
    .map((node) => node.node_id);

  const orderByNodeId = new Map<string, number>();
  const visited = new Set<string>();
  let order = 0;

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;

    if (visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);
    orderByNodeId.set(currentNodeId, order++);

    const currentNode = nodeById.get(currentNodeId);
    if (currentNode) {
      const currentLevel = levelByNodeId.get(currentNodeId) ?? 0;
      for (const nextNodeId of adjacency.get(currentNodeId) ?? []) {
        levelByNodeId.set(
          nextNodeId,
          Math.max(levelByNodeId.get(nextNodeId) ?? 0, currentLevel + 1),
        );
        const nextInDegree = (inDegree.get(nextNodeId) ?? 0) - 1;
        inDegree.set(nextNodeId, nextInDegree);
        if (nextInDegree === 0) {
          queue.push(nextNodeId);
        }
      }
    }
  }

  const remainingNodes = nodes
    .filter((node) => !visited.has(node.node_id))
    .sort((a, b) => toTime(a.created_on) - toTime(b.created_on))
    .map((node) => node.node_id);

  for (const nodeId of remainingNodes) {
    orderByNodeId.set(nodeId, order++);
  }

  return { orderByNodeId, levelByNodeId };
};

export const buildExecutionSequence = (
  nodes: ExecutionGraphNode[],
  connections: ExecutionGraphConnection[],
  executions: ExecutionSequenceExecution[],
): ExecutionSequenceItem[] => {
  const { orderByNodeId } = computeNodeOrder(nodes, connections);

  const executionByNodeId = new Map<string, ExecutionSequenceExecution[]>();
  for (const execution of executions) {
    const existing = executionByNodeId.get(execution.node_id) ?? [];
    existing.push(execution);
    executionByNodeId.set(execution.node_id, existing);
  }

  const outgoingConnectionsByNodeId = new Map<
    string,
    Array<{
      destinationNodeId: string | null;
      destinationNodeClientId: string | null;
      conditionExpression: string | null;
    }>
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

  const sortedExecutions = [...executions].sort(
    (left, right) => toTime(left.created_on) - toTime(right.created_on),
  );
  const executionIndexById = new Map<string, number>();
  sortedExecutions.forEach((execution, index) => {
    executionIndexById.set(execution.id, index);
  });

  const discardedNodeIds = new Set<string>();

  for (const node of nodes) {
    if (node.node_type !== "decision") {
      continue;
    }

    const latestExecution = getLatestTaskExecution(
      executionByNodeId.get(node.node_id) ?? [],
    );

    if (!latestExecution || latestExecution.status !== "completed") {
      continue;
    }

    const executionIndex = executionIndexById.get(latestExecution.id);
    const takenDestinationId =
      executionIndex !== undefined &&
      executionIndex < sortedExecutions.length - 1
        ? (sortedExecutions[executionIndex + 1]?.node_id ?? null)
        : null;

    for (const connection of outgoingConnectionsByNodeId.get(node.node_id) ??
      []) {
      if (
        !connection.destinationNodeId ||
        connection.destinationNodeId === takenDestinationId
      ) {
        continue;
      }

      const queue = [connection.destinationNodeId];
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        if (
          executionByNodeId.has(currentNodeId) ||
          discardedNodeIds.has(currentNodeId)
        ) {
          continue;
        }

        discardedNodeIds.add(currentNodeId);
        for (const outgoing of outgoingConnectionsByNodeId.get(currentNodeId) ??
          []) {
          if (outgoing.destinationNodeId) {
            queue.push(outgoing.destinationNodeId);
          }
        }
      }
    }
  }

  return [...nodes]
    .sort(
      (left, right) =>
        (orderByNodeId.get(left.node_id) ?? Number.MAX_SAFE_INTEGER) -
        (orderByNodeId.get(right.node_id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((node) => {
      const outgoingConnections =
        outgoingConnectionsByNodeId.get(node.node_id) ?? [];
      const latestExecution = getLatestTaskExecution(
        executionByNodeId.get(node.node_id) ?? [],
      );

      let status = mapExecutionStatus(latestExecution?.status);
      if (status === "pending" && discardedNodeIds.has(node.node_id)) {
        status = "discarded";
      }

      return {
        taskId: latestExecution?.task_id ?? null,
        taskExecutionId: latestExecution?.id ?? null,
        userTaskExecutionId:
          node.node_type === "user" || node.node_type === "user_task"
            ? (latestExecution?.user_task_execution_id ?? null)
            : null,
        nodeName: node.node_name,
        nodeType: node.node_type,
        nodeClientId: node.node_client_id,
        status,
        startTime: toDate(latestExecution?.started_on ?? null),
        endTime: toDate(latestExecution?.ended_on ?? null),
        order: orderByNodeId.get(node.node_id) ?? Number.MAX_SAFE_INTEGER,
        outgoingConnections: outgoingConnections.map((connection) => ({
          destinationNodeClientId: connection.destinationNodeClientId,
          conditionExpression: connection.conditionExpression,
        })),
      };
    });
};
