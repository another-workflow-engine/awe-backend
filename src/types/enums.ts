import type {
  ActorType,
  EnvironmentType,
  NodeType,
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
  USER: "user",
} as const satisfies Record<string, NodeType>;

export const WorkflowVersionStatuses = {
  DRAFT: "draft",
  VALID: "valid",
  PUBLISHED: "published",
  ACTIVE: "active",
} as const satisfies Record<string, WorkflowVersionStatus>;

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
