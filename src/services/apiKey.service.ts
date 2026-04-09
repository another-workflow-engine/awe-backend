import Config from "../config.js";
import { AuthError } from "../errors/AuthError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { AppError } from "../errors/AppError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { apiKeyRepository } from "../repositories/apiKey.repository.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes, EnvironmentTypes } from "../types/enums.js";
import type { ActorModel } from "../types/models.js";
import crypto from "node:crypto";
import argon2 from "argon2";
import { db } from "../database.js";
import { actorRepository } from "../repositories/actor.repository.js";
import { baseLogger } from "../logger.js";
import type { EnvironmentType } from "../types/database.js";

export const apiKeyService = {
  getAll: async (actor: ActorModel) => {
    if (actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    return await apiKeyRepository.findByOrganizationActorId(actor.id);
  },

  createNew: async (
    label: string,
    environmentType: EnvironmentType,
    actor: ActorModel,
  ) => {
    if (actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    const validTypes = Object.values(EnvironmentTypes);
    if (!validTypes.includes(environmentType as (typeof validTypes)[number])) {
      throw new AppError(
        `Invalid environment type. Must be one of: ${validTypes.join(", ")}`,
        400,
      );
    }

    const environments = await environmentRepository.findByOrganizationActorId(
      actor.id,
    );
    const environment = environments.find((e) => e.type === environmentType);

    if (!environment) {
      throw new NotFoundError(
        `Environment '${environmentType}' not found for this organization`,
      );
    }

    const existingKeyCount = await apiKeyRepository.countActiveByEnvironmentId(
      environment.id,
    );
    if (existingKeyCount > 0) {
      throw new AppError(
        `API key already exists for environment '${environmentType}'. Revoke the existing key before creating a new one.`,
        409,
      );
    }

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
          environment_id: environment.id,
          label: label,
          key_prefix: prefix,
          key_hash: secretHash,
        },
        transaction,
      );

      return { rawKey, apiKey };
    });
  },

  revoke: async (id: string, actor: ActorModel) => {
    if (actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError();
    }

    const apiKey = await apiKeyRepository.findById(id);

    if (!apiKey) {
      baseLogger.warn(
        { apiKeyId: id, actorId: actor.id },
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

    const environments = await environmentRepository.findById(
      apiKey.environment_id,
    );
    const environmentType = environments?.type || "unknown";

    const activeKeyCount = await apiKeyRepository.countActiveByEnvironmentId(
      apiKey.environment_id,
    );

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
        environmentType,
        activeKeyCountBefore: activeKeyCount,
        revokedAt: revokedKey.revoked_on,
      },
      "API key revoked successfully",
    );

    return revokedKey;
  },

  getActorOrThrow: async (apiKeySecret: string) => {
    const [prefix, secret] = apiKeySecret.split(".", 2);
    if (!prefix || !secret) {
      throw new AuthError("Invalid Api Key");
    }

    const apiKey = await apiKeyRepository.findByPrefix(prefix);

    if (
      !apiKey ||
      apiKey.is_revoked ||
      !(await argon2.verify(apiKey.key_hash, secret))
    ) {
      throw new AuthError();
    }

    const actor = await actorRepository.findById(apiKey.actor_id);
    if (!actor) {
      throw new DataIntegrityError("Api key exists without Actor");
    }

    return actor;
  },
};
