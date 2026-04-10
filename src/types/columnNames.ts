import type {
  Actor,
  ApiKey,
  AuthAuditLogEntries,
  AuthCustomOauthProviders,
  AuthFlowState,
  AuthIdentities,
  AuthInstances,
  AuthMfaAmrClaims,
  AuthMfaChallenges,
  AuthMfaFactors,
  AuthOauthAuthorizations,
  AuthOauthClients,
  AuthOauthClientStates,
  AuthOauthConsents,
  AuthOneTimeTokens,
  AuthRefreshTokens,
  AuthSamlProviders,
  AuthSamlRelayStates,
  AuthSchemaMigrations,
  AuthSessions,
  AuthSsoDomains,
  AuthSsoProviders,
  AuthUsers,
  AuthWebauthnChallenges,
  AuthWebauthnCredentials,
  Edge,
  Environment,
  ExtensionsPgStatStatements,
  ExtensionsPgStatStatementsInfo,
  Instance,
  InstanceLog,
  Node,
  Organization,
  RealtimeMessages,
  RealtimeSchemaMigrations,
  RealtimeSubscription,
  RefreshToken,
  Secret,
  StorageBuckets,
  StorageBucketsAnalytics,
  StorageBucketsVectors,
  StorageMigrations,
  StorageObjects,
  StorageS3MultipartUploads,
  StorageS3MultipartUploadsParts,
  StorageVectorIndexes,
  System,
  Task,
  TaskExecution,
  UserTaskExecution,
  VaultDecryptedSecrets,
  VaultSecrets,
  Workflow,
  WorkflowVersion,
} from "./database.js";

export const actorColumns = ["id", "type"] as const satisfies (keyof Actor)[];

export const apiKeyColumns = [
  "actor_id",
  "created_on",
  "deleted_on",
  "environment_id",
  "id",
  "is_deleted",
  "is_revoked",
  "key_hash",
  "key_prefix",
  "label",
  "modified_on",
  "revoked_on",
] as const satisfies (keyof ApiKey)[];

export const authAuditLogEntriesColumns = [
  "created_at",
  "id",
  "instance_id",
  "ip_address",
  "payload",
] as const satisfies (keyof AuthAuditLogEntries)[];

export const authCustomOauthProvidersColumns = [
  "acceptable_client_ids",
  "attribute_mapping",
  "authorization_params",
  "authorization_url",
  "cached_discovery",
  "client_id",
  "client_secret",
  "created_at",
  "discovery_cached_at",
  "discovery_url",
  "email_optional",
  "enabled",
  "id",
  "identifier",
  "issuer",
  "jwks_uri",
  "name",
  "pkce_enabled",
  "provider_type",
  "scopes",
  "skip_nonce_check",
  "token_url",
  "updated_at",
  "userinfo_url",
] as const satisfies (keyof AuthCustomOauthProviders)[];

export const authFlowStateColumns = [
  "auth_code",
  "auth_code_issued_at",
  "authentication_method",
  "code_challenge",
  "code_challenge_method",
  "created_at",
  "email_optional",
  "id",
  "invite_token",
  "linking_target_id",
  "oauth_client_state_id",
  "provider_access_token",
  "provider_refresh_token",
  "provider_type",
  "referrer",
  "updated_at",
  "user_id",
] as const satisfies (keyof AuthFlowState)[];

export const authIdentitiesColumns = [
  "created_at",
  "email",
  "id",
  "identity_data",
  "last_sign_in_at",
  "provider",
  "provider_id",
  "updated_at",
  "user_id",
] as const satisfies (keyof AuthIdentities)[];

export const authInstancesColumns = [
  "created_at",
  "id",
  "raw_base_config",
  "updated_at",
  "uuid",
] as const satisfies (keyof AuthInstances)[];

export const authMfaAmrClaimsColumns = [
  "authentication_method",
  "created_at",
  "id",
  "session_id",
  "updated_at",
] as const satisfies (keyof AuthMfaAmrClaims)[];

export const authMfaChallengesColumns = [
  "created_at",
  "factor_id",
  "id",
  "ip_address",
  "otp_code",
  "verified_at",
  "web_authn_session_data",
] as const satisfies (keyof AuthMfaChallenges)[];

export const authMfaFactorsColumns = [
  "created_at",
  "factor_type",
  "friendly_name",
  "id",
  "last_challenged_at",
  "last_webauthn_challenge_data",
  "phone",
  "secret",
  "status",
  "updated_at",
  "user_id",
  "web_authn_aaguid",
  "web_authn_credential",
] as const satisfies (keyof AuthMfaFactors)[];

export const authOauthAuthorizationsColumns = [
  "approved_at",
  "authorization_code",
  "authorization_id",
  "client_id",
  "code_challenge",
  "code_challenge_method",
  "created_at",
  "expires_at",
  "id",
  "nonce",
  "redirect_uri",
  "resource",
  "response_type",
  "scope",
  "state",
  "status",
  "user_id",
] as const satisfies (keyof AuthOauthAuthorizations)[];

export const authOauthClientsColumns = [
  "client_name",
  "client_secret_hash",
  "client_type",
  "client_uri",
  "created_at",
  "deleted_at",
  "grant_types",
  "id",
  "logo_uri",
  "redirect_uris",
  "registration_type",
  "token_endpoint_auth_method",
  "updated_at",
] as const satisfies (keyof AuthOauthClients)[];

export const authOauthClientStatesColumns = [
  "code_verifier",
  "created_at",
  "id",
  "provider_type",
] as const satisfies (keyof AuthOauthClientStates)[];

export const authOauthConsentsColumns = [
  "client_id",
  "granted_at",
  "id",
  "revoked_at",
  "scopes",
  "user_id",
] as const satisfies (keyof AuthOauthConsents)[];

export const authOneTimeTokensColumns = [
  "created_at",
  "id",
  "relates_to",
  "token_hash",
  "token_type",
  "updated_at",
  "user_id",
] as const satisfies (keyof AuthOneTimeTokens)[];

export const authRefreshTokensColumns = [
  "created_at",
  "id",
  "instance_id",
  "parent",
  "revoked",
  "session_id",
  "token",
  "updated_at",
  "user_id",
] as const satisfies (keyof AuthRefreshTokens)[];

export const authSamlProvidersColumns = [
  "attribute_mapping",
  "created_at",
  "entity_id",
  "id",
  "metadata_url",
  "metadata_xml",
  "name_id_format",
  "sso_provider_id",
  "updated_at",
] as const satisfies (keyof AuthSamlProviders)[];

export const authSamlRelayStatesColumns = [
  "created_at",
  "flow_state_id",
  "for_email",
  "id",
  "redirect_to",
  "request_id",
  "sso_provider_id",
  "updated_at",
] as const satisfies (keyof AuthSamlRelayStates)[];

export const authSchemaMigrationsColumns = [
  "version",
] as const satisfies (keyof AuthSchemaMigrations)[];

export const authSessionsColumns = [
  "aal",
  "created_at",
  "factor_id",
  "id",
  "ip",
  "not_after",
  "oauth_client_id",
  "refresh_token_counter",
  "refresh_token_hmac_key",
  "refreshed_at",
  "scopes",
  "tag",
  "updated_at",
  "user_agent",
  "user_id",
] as const satisfies (keyof AuthSessions)[];

export const authSsoDomainsColumns = [
  "created_at",
  "domain",
  "id",
  "sso_provider_id",
  "updated_at",
] as const satisfies (keyof AuthSsoDomains)[];

export const authSsoProvidersColumns = [
  "created_at",
  "disabled",
  "id",
  "resource_id",
  "updated_at",
] as const satisfies (keyof AuthSsoProviders)[];

export const authUsersColumns = [
  "aud",
  "banned_until",
  "confirmation_sent_at",
  "confirmation_token",
  "confirmed_at",
  "created_at",
  "deleted_at",
  "email",
  "email_change",
  "email_change_confirm_status",
  "email_change_sent_at",
  "email_change_token_current",
  "email_change_token_new",
  "email_confirmed_at",
  "encrypted_password",
  "id",
  "instance_id",
  "invited_at",
  "is_anonymous",
  "is_sso_user",
  "is_super_admin",
  "last_sign_in_at",
  "phone",
  "phone_change",
  "phone_change_sent_at",
  "phone_change_token",
  "phone_confirmed_at",
  "raw_app_meta_data",
  "raw_user_meta_data",
  "reauthentication_sent_at",
  "reauthentication_token",
  "recovery_sent_at",
  "recovery_token",
  "role",
  "updated_at",
] as const satisfies (keyof AuthUsers)[];

export const authWebauthnChallengesColumns = [
  "challenge_type",
  "created_at",
  "expires_at",
  "id",
  "session_data",
  "user_id",
] as const satisfies (keyof AuthWebauthnChallenges)[];

export const authWebauthnCredentialsColumns = [
  "aaguid",
  "attestation_type",
  "backed_up",
  "backup_eligible",
  "created_at",
  "credential_id",
  "friendly_name",
  "id",
  "last_used_at",
  "public_key",
  "sign_count",
  "transports",
  "updated_at",
  "user_id",
] as const satisfies (keyof AuthWebauthnCredentials)[];

export const edgeColumns = [
  "client_id",
  "condition_expression",
  "created_by",
  "created_on",
  "deleted_by",
  "deleted_on",
  "destination_node_id",
  "id",
  "is_deleted",
  "modified_by",
  "modified_on",
  "name",
  "rule_id",
  "source_node_id",
] as const satisfies (keyof Edge)[];

export const environmentColumns = [
  "created_on",
  "deleted_on",
  "id",
  "is_deleted",
  "system_id",
  "type",
] as const satisfies (keyof Environment)[];

export const extensionsPgStatStatementsColumns = [
  "calls",
  "dbid",
  "jit_deform_count",
  "jit_deform_time",
  "jit_emission_count",
  "jit_emission_time",
  "jit_functions",
  "jit_generation_time",
  "jit_inlining_count",
  "jit_inlining_time",
  "jit_optimization_count",
  "jit_optimization_time",
  "local_blk_read_time",
  "local_blk_write_time",
  "local_blks_dirtied",
  "local_blks_hit",
  "local_blks_read",
  "local_blks_written",
  "max_exec_time",
  "max_plan_time",
  "mean_exec_time",
  "mean_plan_time",
  "min_exec_time",
  "min_plan_time",
  "minmax_stats_since",
  "plans",
  "query",
  "queryid",
  "rows",
  "shared_blk_read_time",
  "shared_blk_write_time",
  "shared_blks_dirtied",
  "shared_blks_hit",
  "shared_blks_read",
  "shared_blks_written",
  "stats_since",
  "stddev_exec_time",
  "stddev_plan_time",
  "temp_blk_read_time",
  "temp_blk_write_time",
  "temp_blks_read",
  "temp_blks_written",
  "toplevel",
  "total_exec_time",
  "total_plan_time",
  "userid",
  "wal_bytes",
  "wal_fpi",
  "wal_records",
] as const satisfies (keyof ExtensionsPgStatStatements)[];

export const extensionsPgStatStatementsInfoColumns = [
  "dealloc",
  "stats_reset",
] as const satisfies (keyof ExtensionsPgStatStatementsInfo)[];

export const instanceColumns = [
  "auto_advance",
  "control_signal",
  "created_by",
  "created_on",
  "current_node_id",
  "current_variables",
  "ended_on",
  "id",
  "input_variables",
  "is_deleted",
  "output_variables",
  "started_on",
  "status",
  "workflow_version_id",
] as const satisfies (keyof Instance)[];

export const instanceLogColumns = [
  "created_by",
  "created_on",
  "details",
  "entity_id",
  "entity_type",
  "event_type",
  "id",
  "instance_id",
] as const satisfies (keyof InstanceLog)[];

export const nodeColumns = [
  "client_id",
  "configuration",
  "created_by",
  "created_on",
  "deleted_by",
  "deleted_on",
  "description",
  "id",
  "input_schema",
  "is_deleted",
  "max_attempts",
  "modified_by",
  "modified_on",
  "name",
  "output_schema",
  "type",
  "workflow_version_id",
  "x_coordinate",
  "y_coordinate",
] as const satisfies (keyof Node)[];

export const organizationColumns = [
  "actor_id",
  "created_on",
  "deleted_on",
  "email",
  "id",
  "is_deleted",
  "modified_on",
  "name",
  "password_hash",
] as const satisfies (keyof Organization)[];

export const realtimeMessagesColumns = [
  "event",
  "extension",
  "id",
  "inserted_at",
  "payload",
  "private",
  "topic",
  "updated_at",
] as const satisfies (keyof RealtimeMessages)[];

export const realtimeSchemaMigrationsColumns = [
  "inserted_at",
  "version",
] as const satisfies (keyof RealtimeSchemaMigrations)[];

export const realtimeSubscriptionColumns = [
  "action_filter",
  "claims",
  "claims_role",
  "created_at",
  "entity",
  "filters",
  "id",
  "subscription_id",
] as const satisfies (keyof RealtimeSubscription)[];

export const refreshTokenColumns = [
  "created_on",
  "expires_at",
  "id",
  "organization_id",
  "token",
] as const satisfies (keyof RefreshToken)[];

export const secretColumns = [
  "created_on",
  "environment_id",
  "id",
  "label",
  "modified_on",
  "organization_id",
  "secret_key",
] as const satisfies (keyof Secret)[];

export const storageBucketsColumns = [
  "allowed_mime_types",
  "avif_autodetection",
  "created_at",
  "file_size_limit",
  "id",
  "name",
  "owner",
  "owner_id",
  "public",
  "type",
  "updated_at",
] as const satisfies (keyof StorageBuckets)[];

export const storageBucketsAnalyticsColumns = [
  "created_at",
  "deleted_at",
  "format",
  "id",
  "name",
  "type",
  "updated_at",
] as const satisfies (keyof StorageBucketsAnalytics)[];

export const storageBucketsVectorsColumns = [
  "created_at",
  "id",
  "type",
  "updated_at",
] as const satisfies (keyof StorageBucketsVectors)[];

export const storageMigrationsColumns = [
  "executed_at",
  "hash",
  "id",
  "name",
] as const satisfies (keyof StorageMigrations)[];

export const storageObjectsColumns = [
  "bucket_id",
  "created_at",
  "id",
  "last_accessed_at",
  "metadata",
  "name",
  "owner",
  "owner_id",
  "path_tokens",
  "updated_at",
  "user_metadata",
  "version",
] as const satisfies (keyof StorageObjects)[];

export const storageS3MultipartUploadsColumns = [
  "bucket_id",
  "created_at",
  "id",
  "in_progress_size",
  "key",
  "metadata",
  "owner_id",
  "upload_signature",
  "user_metadata",
  "version",
] as const satisfies (keyof StorageS3MultipartUploads)[];

export const storageS3MultipartUploadsPartsColumns = [
  "bucket_id",
  "created_at",
  "etag",
  "id",
  "key",
  "owner_id",
  "part_number",
  "size",
  "upload_id",
  "version",
] as const satisfies (keyof StorageS3MultipartUploadsParts)[];

export const storageVectorIndexesColumns = [
  "bucket_id",
  "created_at",
  "data_type",
  "dimension",
  "distance_metric",
  "id",
  "metadata_configuration",
  "name",
  "updated_at",
] as const satisfies (keyof StorageVectorIndexes)[];

export const systemColumns = [
  "created_on",
  "deleted_on",
  "description",
  "id",
  "is_deleted",
  "modified_on",
  "name",
  "organization_id",
] as const satisfies (keyof System)[];

export const taskColumns = [
  "created_on",
  "id",
  "instance_id",
  "node_id",
  "status",
] as const satisfies (keyof Task)[];

export const taskExecutionColumns = [
  "created_on",
  "ended_on",
  "id",
  "input_variables",
  "output_variables",
  "started_on",
  "status",
  "task_id",
] as const satisfies (keyof TaskExecution)[];

export const userTaskExecutionColumns = [
  "assignee",
  "created_on",
  "id",
  "task_execution_id",
  "title",
] as const satisfies (keyof UserTaskExecution)[];

export const vaultDecryptedSecretsColumns = [
  "created_at",
  "decrypted_secret",
  "description",
  "id",
  "key_id",
  "name",
  "nonce",
  "secret",
  "updated_at",
] as const satisfies (keyof VaultDecryptedSecrets)[];

export const vaultSecretsColumns = [
  "created_at",
  "description",
  "id",
  "key_id",
  "name",
  "nonce",
  "secret",
  "updated_at",
] as const satisfies (keyof VaultSecrets)[];

export const workflowColumns = [
  "created_by",
  "created_on",
  "deleted_by",
  "deleted_on",
  "description",
  "environment_id",
  "id",
  "is_deleted",
  "modified_by",
  "modified_on",
  "name",
] as const satisfies (keyof Workflow)[];

export const workflowVersionColumns = [
  "created_by",
  "created_on",
  "deleted_by",
  "deleted_on",
  "description",
  "id",
  "is_deleted",
  "modified_by",
  "modified_on",
  "published_on",
  "status",
  "version",
  "workflow_id",
] as const satisfies (keyof WorkflowVersion)[];
