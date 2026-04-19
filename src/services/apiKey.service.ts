import Config from "../config.js";
import { AuthError } from "../errors/AuthError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { AppError } from "../errors/AppError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { apiKeyRepository } from "../repositories/apiKey.repository.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes, EnvironmentTypes } from "../types/enums.js";
import type { ActorModel, OrganizationModel } from "../types/models.js";
import crypto from "node:crypto";
import argon2 from "argon2";
import { db } from "../database.js";
import { actorRepository } from "../repositories/actor.repository.js";
import { baseLogger } from "../logger.js";
import type { ApiKeyModel } from "../types/models.js";
import type { EnvironmentType } from "../types/database.js";
import type { RequestContext } from "../types/auth.js";

export const apiKeyService = {
  getAll: async (
    requestContext: RequestContext,
    environments?: EnvironmentType[],
  ): Promise<Array<ApiKeyModel & { environment: EnvironmentType }>> => {
    if (requestContext.actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    const apiKeys = await apiKeyRepository.findByOrganizationId(
      requestContext.organization.id,
    );

    if (!environments || environments.length === 0) {
      return apiKeys;
    }

    const selected = new Set(environments);
    return apiKeys.filter((apiKey) => selected.has(apiKey.environment));
  },

  createNew: async (
    label: string | undefined,
    environment: EnvironmentType,
    requestContext: RequestContext,
  ): Promise<{
    rawKey: string;
    apiKey: ApiKeyModel;
    environment: EnvironmentType;
  }> => {
    if (requestContext.actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    const validTypes = Object.values(EnvironmentTypes);
    if (!validTypes.includes(environment as (typeof validTypes)[number])) {
      throw new AppError(
        `Invalid environment type. Must be one of: ${validTypes.join(", ")}`,
        400,
      );
    }

    const selectedEnvironment = requestContext.environments.find(
      (e) => e.type === environment,
    );

    if (!selectedEnvironment) {
      throw new NotFoundError(
        `Environment '${environment}' not found for this organization`,
      );
    }

    const existingKeyCount = await apiKeyRepository.countActiveByEnvironmentId(
      selectedEnvironment.id,
    );
    if (existingKeyCount > 0) {
      throw new AppError(
        `API key already exists for environment '${environment}'. Revoke the existing key before creating a new one.`,
        409,
      );
    }

    const resolvedLabel = label?.trim() || `API Key (${environment})`;

    const prefix = `${Config.API_KEY_PREFIX}_${crypto.randomBytes(4).toString("hex")}`;
    const secret = crypto.randomBytes(32).toString("hex");
    const rawKey = `${prefix}.${secret}`;
    const secretHash = await argon2.hash(secret);

    return await db.transaction().execute(async (transaction) => {
      const apiKeyActor = await actorRepository.insert(
        {
          type: ActorTypes.API_KEY_CLIENT,
        },
        transaction,
      );

      const apiKey = await apiKeyRepository.insert(
        {
          actor_id: apiKeyActor.id,
          environment_id: selectedEnvironment.id,
          label: resolvedLabel,
          key_prefix: prefix,
          key_hash: secretHash,
        },
        transaction,
      );

      return { rawKey, apiKey, environment: selectedEnvironment.type };
    });
  },

  revoke: async (id: string, requestContext: RequestContext) => {
    if (requestContext.actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    const apiKey = await apiKeyRepository.findById(
      id,
      requestContext.environments.map((env) => env.id),
    );

    if (!apiKey) {
      baseLogger.warn(
        { apiKeyId: id, actorId: requestContext.actor.id },
        "API key revoke failed: Key not found",
      );
      throw new NotFoundError("API key not found");
    }

    if (apiKey.is_revoked) {
      baseLogger.warn(
        { apiKeyId: id, environmentId: apiKey.environment_id },
        "API key revoke failed: Key already revoked",
      );
      throw new AppError("API key is already revoked", 400);
    }

    const revokedKey = await apiKeyRepository.revokeById(id);

    if (!revokedKey) {
      baseLogger.error(
        { apiKeyId: id, environmentId: apiKey.environment_id },
        "API key revoke failed: Database update returned null",
      );
      throw new AppError("Failed to revoke API key", 500);
    }

    baseLogger.info(
      {
        apiKeyId: id,
        environmentId: apiKey.environment_id,
        revokedAt: revokedKey.revoked_on,
      },
      "API key revoked successfully",
    );

    return revokedKey;
  },

  getRequestContextOrThrow: async (
    apiKeySecret: string,
  ): Promise<RequestContext> => {
    const [prefix, secret] = apiKeySecret.split(".", 2);
    if (!prefix || !secret) {
      throw new AuthError("Invalid Api Key");
    }

    const models = await apiKeyRepository.findByPrefixWithRelations(prefix);

    if (
      !models ||
      models.apiKey.is_revoked ||
      !(await argon2.verify(models.apiKey.key_hash, secret))
    ) {
      throw new AuthError();
    }

    return {
      actor: models.actor,
      organization: models.organization,
      environments: [models.environment],
    };
  },
};
