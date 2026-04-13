import type { Selectable } from "kysely";
import type {
  Actor,
  ApiKey,
  Edge,
  Environment,
  Instance,
  InstanceLog,
  Node,
  Organization,
  RefreshToken,
  SecretProvider,
  SecretReference,
  System,
  Task,
  TaskExecution,
  UserTaskExecution,
  Workflow,
  WorkflowVersion,
} from "./database.js";
import type {} from "./workflow.js";
import { NodeTypes } from "./enums.js";

export type ActorModel = Selectable<Actor>;

export type OrganizationModel = Selectable<Organization>;

export type SystemModel = Selectable<System>;

export type EnvironmentModel = Selectable<Environment>;

export type RefreshTokenModel = Selectable<RefreshToken>;

export type ApiKeyModel = Selectable<ApiKey>;

export type WorkflowModel = Selectable<Workflow>;

export type WorkflowVersionModel = Selectable<WorkflowVersion>;

type BaseNodeModel = Omit<Selectable<Node>, "type">;

export type StartNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.START;
};

export type DecisionNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.DECISION;
};

export type EndNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.END;
};

export type ScriptNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.SCRIPT;
};

export type ServiceNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.SERVICE;
};

export type UserNodeModel = BaseNodeModel & {
  type: typeof NodeTypes.USER;
};

export type NodeModel =
  | StartNodeModel
  | DecisionNodeModel
  | EndNodeModel
  | ScriptNodeModel
  | ServiceNodeModel
  | UserNodeModel;

export type EdgeModel = Selectable<Edge>;

export type InstanceModel = Selectable<Instance>;

export type TaskModel = Selectable<Task>;

export type TaskExecutionModel = Selectable<TaskExecution>;

export type UserTaskExecutionModel = Selectable<UserTaskExecution>;

export type InstanceLogModel = Selectable<InstanceLog>;

export type SecretProviderModel = Selectable<SecretProvider>;

export type SecretReferenceModel = Selectable<SecretReference>;
