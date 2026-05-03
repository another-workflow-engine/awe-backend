import type { Insertable, Updateable } from "kysely";
import type {
  ActorType,
  WorkflowVersion,
  WorkflowVersionStatus,
} from "./database.js";

export type WorkflowVersionListItem = {
  id: string;
  version: string | null;
  description: string | null;
  status: WorkflowVersionStatus;

  publishedAt: Date | null;

  modifiedAt: Date;
  modifiedBy: ActorType;
};

export type NewWorkflowVersion = Insertable<WorkflowVersion>;

export type UpdateWorkflowVersion = Updateable<WorkflowVersion>;
