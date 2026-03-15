import type { TaskStatus } from "../types/database.js";

export interface WorkflowContext {
  global: Record<string, unknown>;
}

export interface ExecutorResult {
  status: TaskStatus;
  outputVariables: Record<string, unknown>;
  error?: string;
}
