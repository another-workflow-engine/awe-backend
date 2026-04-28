import z from "zod";
import type { TaskStatus } from "./database.js";
import {
  ContextSchema,
  type FetchableSettingsSchema,
  type UrlSettingsSchema,
} from "../schemas/context.schema.js";

export type UrlSettings = z.infer<typeof UrlSettingsSchema>;

export type FetchableSettings = z.infer<typeof FetchableSettingsSchema>;

export type Context = z.infer<typeof ContextSchema>;

export interface ExecutorResult {
  executionId: string;
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

export type EvaluatedContext = {
  context: Record<string, unknown>;
  secret: Record<string, string>;
};

export const ScriptExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.record(z.string(), z.unknown()),
});

export type ScriptExecutionResult = z.infer<typeof ScriptExecutionResultSchema>;

export interface ScriptExecutionService {
  executeScript(
    credentials: Record<string, string>,
    sourceCode: string,
    entryFunctionName: string,
    parameters: unknown[],
    signal?: AbortSignal,
  ): Promise<ScriptExecutionResult>;
}
