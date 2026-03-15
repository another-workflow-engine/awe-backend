import type { InstanceModel } from "../../types/models.js";
import type { WorkflowContext } from "../types.js";

export interface QueueJob {
  instanceId: string;
  nodeId: string;
  context: WorkflowContext;
}

export type NodeRunResult =
  | { outcome: "failed"; instance: InstanceModel }
  | { outcome: "completed"; instance: InstanceModel }
  | { outcome: "next"; instance: InstanceModel; nextNodeIds: string[]; context: WorkflowContext }
  | { outcome: "user_task"; instance: InstanceModel; taskId: string };

