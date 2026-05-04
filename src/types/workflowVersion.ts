import type { Insertable, Updateable } from "kysely";
import type {
  ActorType,
  WorkflowVersion,
  WorkflowVersionStatus,
} from "./database.js";
import type { ValidationResult } from "../services/workflowValidator.service.js";

export type WorkflowVersionListItem = {
  id: string;
  version: string | null;
  description: string | null;
  status: WorkflowVersionStatus;

  publishedAt: Date | null;

  modifiedAt: Date;
  modifiedBy: ActorType;
};

export type WorkflowVersionMetaData = {
  workflowVersion: {
    id: string;
    workflow_id: string;

    description: string | null;
    status: WorkflowVersionStatus;
    version: string | null;

    modifiedAt: Date;
    modifiedBy: ActorType;

    publishedAt: Date | null;
  };
} & ValidationResult;

export type NewWorkflowVersion = Insertable<WorkflowVersion>;

export type UpdateWorkflowVersion = Updateable<WorkflowVersion>;
