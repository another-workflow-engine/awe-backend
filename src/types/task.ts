import type { Insertable, Updateable } from "kysely";
import type { NodeType, Task, TaskExecution, TaskStatus } from "./database.js";
import type { Context } from "./engine.js";
import type { NodeConfiguration } from "./workflow.js";
import type { FeelDataType, FieldUiType } from "./enums.js";

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

export type PendingUserTaskListItem = {
  id: string;
  title: string | null;
  assignee: string | null;
  createdAt: Date;
  instanceId: string;
  taskId: string;
  workflowVersionId: string;
  nodeId: string;
};

export type UserTaskResponseData = {
  fieldId: string;
  label: string;
  dataType: FeelDataType;
  required: boolean;
  defaultValue: unknown | undefined;
  uiType: FieldUiType | undefined;
  options: { label: string | undefined; value: unknown }[] | undefined;
};

export type UserTaskDetail = {
  id: string;
  title: string | null;
  assignee: string | null;
  startedAt: Date;
  endedAt: Date | null;
  status: TaskStatus;
  requestData: Record<string, unknown>;
  responseData: UserTaskResponseData[];
  instanceId: string;
  taskId: string;
  nodeId: string;
  workflow: {
    id: string;
    versionId: string;
    version: string | null;
    name: string;
  };
};
