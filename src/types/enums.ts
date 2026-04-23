import type {
  ActorType,
  EnvironmentType,
  InstanceControlSignal,
  InstanceEntityType,
  InstanceEventType,
  InstanceStatus,
  NodeType,
  SecretProviderType,
  TaskStatus,
  WorkflowVersionStatus,
} from "./database.js";

export const ActorTypes = {
  API_KEY_CLIENT: "api_key_client",
  ORGANIZATION_ACCOUNT: "organization_account",
} as const satisfies Record<string, ActorType>;

export const EnvironmentTypes = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
  STAGING: "staging",
} as const satisfies Record<string, EnvironmentType>;

export const NodeTypes = {
  START: "start",
  DECISION: "decision",
  END: "end",
  SCRIPT: "script",
  SERVICE: "service",
  EMAIL: "email",
  USER: "user",
} as const satisfies Record<string, NodeType>;

export const WorkflowVersionStatuses = {
  DRAFT: "draft",
  VALID: "valid",
  PUBLISHED: "published",
  ACTIVE: "active",
} as const satisfies Record<string, WorkflowVersionStatus>;

export const InstanceStatuses = {
  COMPLETED: "completed",
  FAILED: "failed",
  IN_PROGRESS: "in_progress",
  PAUSED: "paused",
  TERMINATED: "terminated",
} as const satisfies Record<string, InstanceStatus>;

export const TaskStatuses = {
  COMPLETED: "completed",
  FAILED: "failed",
  IN_PROGRESS: "in_progress",
  TERMINATED: "terminated",
  PAUSED: "paused",
} as const satisfies Record<string, TaskStatus>;

export const InstanceEntityTypes = {
  INSTANCE: "instance",
  TASK: "task",
  TASK_EXECUTION: "task_execution",
  USER_TASK_EXECUTION: "user_task_execution",
} as const satisfies Record<string, InstanceEntityType>;

export const LogEventTypes = {
  COMPLETED: "completed",
  FAILED: "failed",
  PAUSE_REQUESTED: "pause_requested",
  RESUME_REQUESTED: "resume_requested",
  PAUSED: "paused",
  TERMINATED: "terminated",
  RESUMED: "resumed",
  STARTED: "started",
  RETRIED: "retried",
  TERMINATE_REQUESTED: "terminate_requested",
} as const satisfies Record<string, InstanceEventType>;

export const InstanceControlSignals = {
  PAUSE: "pause",
  TERMINATE: "terminate",
} as const satisfies Record<string, InstanceControlSignal>;

export enum FeelDataType {
  NUMBER = "number",
  STRING = "string",
  BOOLEAN = "boolean",
  DATE = "date",
  TIME = "time",
  DATETIME = "date-time",
  LIST = "list",
  OBJECT = "object",
  NULL = "null",
}

export enum TimeUnit {
  MILLISECOND = "millisecond",
  SECOND = "second",
  MINUTE = "minute",
}

export enum BackoffType {
  FIXED = "fixed",
  EXPONENTIAL = "exponential",
}

export const SecretProviderTypes = {
  AWS_SECRETS_MANAGER: "aws_secrets_manager",
  DEFAULT: "default",
  INFISICAL: "infisical",
} as const satisfies Record<string, SecretProviderType>;

export enum VersionIncrementType {
  MAJOR = "major",
  MINOR = "minor",
  PATCH = "patch",
}

export enum Runtime {
  PYTHON_3 = "python3",
}

export enum ScriptExecutionService {
  JDOODLE = "jdoodle",
  GEMINI = "gemini",
}
