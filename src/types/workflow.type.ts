export type ExecutionStatus =
  | "RUNNING"
  | "WAITING_FOR_USER_INPUT"
  | "COMPLETED"
  | "FAILED";

/**
 * Global workflow execution context
 * Stores variables generated during workflow execution
 */
export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  data: Record<string, any>;
  currentNodeId?: string;
  status: ExecutionStatus;
}

//Generic workflow node definition
export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  nextNodeId?: string;
  config?: any;
}

//User task definition created when a USER_TASK node is reached
export interface UserTask {
  taskId: string;
  nodeId: string;
  executionId: string;
  status: "PENDING" | "COMPLETED";
  formFields: {
    name: string;
    type: string;
  }[];
  createdAt: Date;
}

// Execution result returned by node handlers
export interface ExecutionResult {
  executionStatus: ExecutionStatus;
  nodeId: string;
  taskId?: string;
  message?: string;
}