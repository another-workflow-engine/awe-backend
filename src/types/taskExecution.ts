import type { TaskExecutionModel } from "./models.js";

export type ExecutionNodeStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "terminated"
  | "pending"
  | "discarded";

export type ExecutionGraphNode = {
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  created_on: Date;
};

export type ExecutionGraphConnection = {
  source_node_id: string;
  destination_node_id: string | null;
  destination_node_client_id: string | null;
  condition_expression: string | null;
};

export type ExecutionGraphExecution = TaskExecutionModel & {
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  user_task_execution_id: string | null;
};

export type ExecutionSequenceExecution = {
  id: string;
  task_id: string;
  status: TaskExecutionModel["status"];
  started_on: Date | null;
  ended_on: Date | null;
  created_on: Date;
  node_id: string;
  node_client_id: string;
  node_type: string;
  node_name: string | null;
  user_task_execution_id: string | null;
};

export type ExecutionSequenceData = {
  nodes: ExecutionGraphNode[];
  connections: ExecutionGraphConnection[];
  executions: ExecutionSequenceExecution[];
};

export type ExecutionSequenceOutgoingConnection = {
  destinationNodeClientId: string | null;
  conditionExpression: string | null;
};

export type ExecutionSequenceItem = {
  taskId: string | null;
  taskExecutionId: string | null;
  userTaskExecutionId: string | null;
  nodeName: string | null;
  nodeType: string;
  nodeClientId: string;
  status: ExecutionNodeStatus;
  startTime: Date | null;
  endTime: Date | null;
  order: number;
  outgoingConnections: ExecutionSequenceOutgoingConnection[];
};

export type ExecutionSequenceResponse = {
  executionSequence: ExecutionSequenceItem[];
};

export type TaskExecutionDetailItem = {
  inputVariables: unknown;
  outputVariables: unknown;
};

export type TaskDetailItem = {
  id: string;
  status: string;
  createdAt: Date;
  nodeId: string;
};

export type TaskExecutionDetailResponse = {
  task: TaskDetailItem;
  taskExecution: TaskExecutionDetailItem;
  nodeConfiguration: unknown;
};