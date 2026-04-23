import type { Insertable, Updateable } from "kysely";
import type {
  ActorType,
  EnvironmentType,
  Instance,
  InstanceControlSignal,
  InstanceStatus,
  NodeType,
  TaskStatus,
} from "./database.js";
import type { Context } from "./engine.js";
import type { InstanceModel, TaskExecutionModel, TaskModel } from "./models.js";

export type NewInstance = Insertable<Instance>;
export type UpdateInstance = Updateable<Instance>;

export type WorkflowDetail = {
  id: string;
  name: string;
  versionId: string;
  version: string | null;
};

export type InstanceListItem = {
  id: string;
  status: InstanceStatus;
  controlSignal: InstanceControlSignal | null;
  autoAdvance: boolean;
  startedAt: Date | null;
  endedAt: Date | null;

  workflow: WorkflowDetail;
  environment: EnvironmentType;

  createdBy: ActorType;
};

export type CurrentTaskDetail = {
  id: string;
  status: TaskStatus;
  startedAt: Date;

  executionId: string | null;

  nodeId: string;
  name: string | null;
  type: NodeType;
};

export type InstanceDetail = {
  id: string;

  startedAt: Date;
  endedAt: Date | null;

  status: InstanceStatus;
  controlSignal: InstanceControlSignal | null;
  autoAdvance: boolean;

  inputVariables: Record<string, unknown>;
  currentVariables: Context;
  outputVariables: Record<string, unknown>;

  workflow: WorkflowDetail;

  currentTask: CurrentTaskDetail | null;
};

export type LockedInProgressOrPausedRelations = {
  instance: InstanceModel | undefined;
  task: TaskModel | undefined;
  taskExecution: TaskExecutionModel | undefined;
};
