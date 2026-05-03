import Config from "../config.js";
import { AuthError } from "../errors/AuthError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { apiKeyRepository } from "../repositories/apiKey.repository.js";
import { ActorTypes, ApiKeyStatus } from "../types/enums.js";
import crypto from "node:crypto";
import argon2 from "argon2";
import { actorRepository } from "../repositories/actor.repository.js";
import type { ApiKeyModel, EnvironmentModel } from "../types/models.js";
import type { RequestContext } from "../types/auth.js";
import type z from "zod";
import type { CreateApiKeySchema } from "../controllers/apiKey.controller.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import { openTransaction } from "../utils/database.utils.js";
import { environmentUtils } from "../utils/environment.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import type { EnvironmentType } from "../types/database.js";

type CreateApiKey = z.infer<typeof CreateApiKeySchema>;

export const apiKeyService = {
  getAll: async (
    selectedEnvironmentTypes: EnvironmentType[],
    environments: EnvironmentModel[],
  ) => {
    const environmentIds = environmentUtils.getFilteredEnvironmentIds(
      environments,
      selectedEnvironmentTypes,
    );

    if (environmentIds.length === 0) {
      return [];
    }

    const apiKeys = await apiKeyRepository.findByEnvironmentIds(environmentIds);

    return apiKeys.map((apiKey) => {
      const environment = environments.find(
        (env) => env.id === apiKey.environment_id,
      );
      if (!environment) {
        throw new DataIntegrityError(
          `No environment for api key id=${apiKey.id}`,
        );
      }

      return {
        id: apiKey.id,
        label: apiKey.label,
        environment: environment.type,
        prefix: apiKey.key_prefix,
        status: apiKey.is_revoked ? ApiKeyStatus.REVOKED : ApiKeyStatus.ACTIVE,
        revokedAt: apiKey.revoked_on,
        createdAt: apiKey.modified_on,
      };
    });
  },

  createNew: async (
    data: CreateApiKey,
    environments: EnvironmentModel[],
  ): Promise<{
    rawKey: string;
    apiKey: ApiKeyModel;
    environment: EnvironmentModel;
  }> => {
    const selectedEnvironment = environments.find(
      (env) => env.type === data.environment,
    );

    if (!selectedEnvironment) {
      throw new NotFoundError(`Environment '${data.environment}'`);
    }

    if (
      await apiKeyRepository.doesUnrevokedExistByEnvironmentId(
        selectedEnvironment.id,
      )
    ) {
      throw new InvalidOperationError(
        `API key already exists for environment '${data.environment}'. Revoke the existing key before creating a new one.`,
      );
    }

    const prefix = `${Config.API_KEY_PREFIX}_${crypto.randomBytes(4).toString("hex")}`;
    const secret = crypto.randomBytes(32).toString("hex");
    const rawKey = `${prefix}.${secret}`;
    const secretHash = await argon2.hash(secret);

    return await openTransaction(async (transaction) => {
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
          label: data.label,
          key_prefix: prefix,
          key_hash: secretHash,
        },
        transaction,
      );

      return { rawKey, apiKey, environment: selectedEnvironment };
    });
  },

  revoke: async (
    id: string,
    environments: EnvironmentModel[],
  ): Promise<ApiKeyModel> => {
    const apiKey = await apiKeyRepository.findById(id);

    if (
      !apiKey ||
      !environments.find((env) => env.id === apiKey.environment_id)
    ) {
      throw new NotFoundError("API Key");
    }

    if (apiKey.is_revoked) {
      throw new InvalidOperationError("API key is already revoked");
    }

    return await apiKeyRepository.updateById(apiKey.id, {
      is_revoked: true,
      revoked_on: new Date(),
    });
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
