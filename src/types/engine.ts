import type { TaskStatus } from "./database";
import type { FeelDataType } from "./enums";

export interface UrlSettings {
  urlExpression: string;
  headers: Record<string, string>;
}

export interface FetchableSettings {
  urlId: string;
  jsonPath: string;
  dataType: FeelDataType;
}

export interface ContextVariables {
  constants: Record<string, unknown>; // variableName: value
  fetchables: Record<string, FetchableSettings>; // variableName: FetchableSettings
  urls: Record<string, UrlSettings>; // urlId: settings
}

export interface ExecutorResult {
  status: TaskStatus;
  outputVariables: Record<string, unknown>; // variableName: value
  nextNodeId: string | null;
  errorMessage?: string;
}

export interface QueueJobData {
  instanceId: string;
  taskId: string;
  nodeId: string;
}

export type NodeRunResult = { nextNodeIds: string[] };

export interface ScriptExecutionResponse {
  output?: Record<string, unknown>;
  error?: string;
}
