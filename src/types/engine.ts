import z from "zod";
import type { TaskStatus } from "./database.js";
import type { FeelDataType } from "./enums.js";

export interface UrlSettings {
  urlExpression: string;
  headers: Record<string, string>;
}

export interface FetchableSettings {
  urlId: string;
  jsonPath: string;
  dataType: FeelDataType;
}

export interface InputVariables {
  constants: Record<string, unknown>; // variableName: value
  fetchables: Record<string, FetchableSettings>; // variableName: FetchableSettings
  urls: Record<string, UrlSettings>; // urlId: settings
}

export interface ExecutorResult {
  status: TaskStatus;
  outputVariables: Record<string, unknown>; // variableName: value
  nextNodeId: string | null;
  errorMessage?: string;
  error?: object;
}

export interface QueueJobData {
  instanceId: string;
  taskId: string;
  nodeId: string;
}

export type NodeRunResult = { nextNodeIds: string[] };

export type Context = {
  context: Record<string, unknown>;
};

export const ScriptExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.record(z.string(), z.unknown()),
});

export type ScriptExecutionResult = z.infer<typeof ScriptExecutionResultSchema>;

export interface ScriptExecutionService {
  executeScript(
    sourceCode: string,
    entryFunctionName: string,
    parameters: unknown[],
  ): Promise<ScriptExecutionResult>;
}
