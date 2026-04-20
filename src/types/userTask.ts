export type PendingUserTaskList = {
  id: string;
  title: string | null;
  assignee: string | null;
  createdAt: Date;
  workflow: WorkflowDetailsForUserTask;
};

export type WorkflowDetailsForUserTask = {
  instanceId: string;
  versionId: string;
  name: string;
};
