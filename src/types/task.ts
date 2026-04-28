import type { Insertable, Updateable } from "kysely";
import type {
  InstanceStatus,
  NodeType,
  Task,
  TaskExecution,
  TaskStatus,
} from "./database.js";
import type { Context } from "./engine.js";
import type { NodeConfiguration } from "./workflow.js";

export type NewTask = Insertable<Task>;
export type UpdateTask = Updateable<Task>;

export type NewTaskExecution = Insertable<TaskExecution>;
export type UpdateTaskExecution = Updateable<TaskExecution>;

export type TaskDetailNode = {
  id: string;
  type: NodeType;
  configuration: NodeConfiguration;
};

export type TaskDetailExecution = {
  id: string;
  status: TaskStatus;

  startedAt: Date;
  endedAt: Date | null;

  inputVariables: Context;
  outputVariables: Record<string, unknown> | null;

  title: string | null;
  assignee: string | null;
};

export type TaskDetail = {
  id: string;
  instanceId: string;

  status: TaskStatus;
  createdAt: Date;

  node: TaskDetailNode;
  executions: TaskDetailExecution[];
};

export type TaskRetryDetail = {
  id: string;
  executionId: string | null;
  status: TaskStatus;
  inputVariables: Context;
  createdAt: Date;

  instance: {
    id: string;
    status: InstanceStatus;
  };

  node: {
    id: string;
    type: NodeType;
  };
};
