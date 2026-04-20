import type { Actor, ApiKey, Edge, Environment, Instance, InstanceLog, Node, Organization, RefreshToken, SecretProvider, SecretReference, Task, TaskExecution, UserTaskExecution, Workflow, WorkflowVersion } from "./database.js";



export const actorColumns = ["id","type"] as const satisfies (keyof Actor)[];

export const apiKeyColumns = ["actor_id","created_on","deleted_on","environment_id","id","is_deleted","is_revoked","key_hash","key_prefix","label","modified_on","revoked_on"] as const satisfies (keyof ApiKey)[];

export const edgeColumns = ["client_id","condition_expression","created_by","created_on","deleted_by","deleted_on","destination_node_id","id","is_deleted","modified_by","modified_on","name","rule_id","source_node_id"] as const satisfies (keyof Edge)[];

export const environmentColumns = ["created_on","deleted_on","id","is_deleted","organization_id","type"] as const satisfies (keyof Environment)[];

export const instanceColumns = ["auto_advance","control_signal","created_by","created_on","current_node_id","current_variables","ended_on","id","input_variables","is_deleted","output_variables","started_on","status","workflow_version_id"] as const satisfies (keyof Instance)[];

export const instanceLogColumns = ["created_by","created_on","details","entity_id","entity_type","event_type","id","instance_id"] as const satisfies (keyof InstanceLog)[];

export const nodeColumns = ["client_id","configuration","created_by","created_on","deleted_by","deleted_on","description","id","input_schema","is_deleted","max_attempts","modified_by","modified_on","name","output_schema","type","workflow_version_id","x_coordinate","y_coordinate"] as const satisfies (keyof Node)[];

export const organizationColumns = ["actor_id","created_on","deleted_on","email","id","is_deleted","modified_on","name","password_hash"] as const satisfies (keyof Organization)[];

export const refreshTokenColumns = ["created_on","expires_at","id","organization_id","token"] as const satisfies (keyof RefreshToken)[];

export const secretProviderColumns = ["configuration","created_on","id","label","organization_id","type","updated_on"] as const satisfies (keyof SecretProvider)[];

export const secretReferenceColumns = ["created_on","environment_id","id","label","provider_id","secret_key"] as const satisfies (keyof SecretReference)[];

export const taskColumns = ["created_on","id","instance_id","node_id","status"] as const satisfies (keyof Task)[];

export const taskExecutionColumns = ["created_on","ended_on","id","input_variables","output_variables","started_on","status","task_id"] as const satisfies (keyof TaskExecution)[];

export const userTaskExecutionColumns = ["assignee","created_on","id","task_execution_id","title"] as const satisfies (keyof UserTaskExecution)[];

export const workflowColumns = ["base_workflow_id","created_by","created_on","deleted_by","deleted_on","description","environment_id","id","is_deleted","modified_by","modified_on","name"] as const satisfies (keyof Workflow)[];

export const workflowVersionColumns = ["created_by","created_on","deleted_by","deleted_on","description","id","is_deleted","modified_by","modified_on","published_on","status","version","workflow_id"] as const satisfies (keyof WorkflowVersion)[];