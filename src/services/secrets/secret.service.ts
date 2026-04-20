import { environmentService } from "../environment.services.js";
import type z from "zod";
import type { CreateNewSecretSchema } from "../../controllers/secret.controller.js";
import { secretReferenceRepository } from "../../repositories/secretReference.repository.js";
import { EngineError } from "../../errors/EngineError.js";
import { providerClassMap } from "./providers/providerMap.js";
import { secretProviderRepository } from "../../repositories/secretProvider.repository.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import { ActorSchema } from "../../schemas/actor.schema.js";
import type { EnvironmentType } from "../../types/database.js";
import type {
  EnvironmentModel,
  OrganizationModel,
} from "../../types/models.js";
import type { RequestContext } from "../../types/auth.js";

type CreateNewSecretSchemaType = z.infer<typeof CreateNewSecretSchema>;

function getProviderClass(providerType: string) {
  const ProviderClass =
    providerClassMap[providerType as keyof typeof providerClassMap];

  if (!ProviderClass) {
    throw new EngineError(
      `Secret provider type '${providerType}' is not currently implemented`,
    );
  }

  return ProviderClass;
}

function normalizeSecretValue(value: unknown, secretId: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    throw new EngineError(`Secret ${secretId} resolved to an empty value`);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.secretValue === "string") {
      return record.secretValue;
    }

    if (typeof record.value === "string") {
      return record.value;
    }

    if (typeof record.data === "string") {
      return record.data;
    }
  }

  return String(value);
}

export const secretService = {
  createNew: async (data: CreateNewSecretSchemaType) => {
    const environment = await environmentService.getByActorAndEnvironment(
      data.actor,
      data.environment,
    );

    const providerModel = await secretProviderRepository.findById(
      data.providerId,
    );
    if (!providerModel) {
      throw new NotFoundError("Secret provider");
    }

    const ProviderClass = getProviderClass(providerModel.type);
    const providerInstance = new ProviderClass(providerModel);
    const result = await providerInstance.testSecretExists(data.key);

    if (!result.success) {
      const message = result.error ? result.error.message : "Unkown error";
      throw new InvalidOperationError(message, result.error);
    }

    return await secretReferenceRepository.insert({
      label: data.label,
      provider_id: data.providerId,
      environment_id: environment.id,
      secret_key: data.key,
    });
  },

  getByIds: async (secretIds: string[]): Promise<Record<string, string>> => {
    if (secretIds.length === 0) {
      return {};
    }

    const referenceMap =
      await secretReferenceRepository.findByIdsWithProviders(secretIds);

    const secrets: Record<string, string> = {};

    for (const [provider, references] of referenceMap) {
      const ProviderClass = getProviderClass(provider.type);
      const providerInstance = new ProviderClass(provider);

      const keys = references.map((r) => r.secret_key);
      const valueMap = await providerInstance.fetchSecrets(keys);

      references.forEach((ref) => {
        const value = valueMap[ref.secret_key];
        if (value === undefined) {
          throw new EngineError(
            `Secret key "${ref.secret_key}" not returned by provider`,
          );
        }
        secrets[ref.id] = normalizeSecretValue(value, ref.id);
      });
    }

    return secrets;
  },

  list: async (
    environmentTypes: EnvironmentType[],
    requestContext: RequestContext,
  ) => {
    return await secretReferenceRepository.findByOrganizationIdAndEnvironmentIds(
      requestContext.organization.id,
      requestContext.environments.reduce<string[]>((acc, env) => {
        if (env.id && environmentTypes.includes(env.type)) {
          acc.push(env.id);
        }
        return acc;
      }, []),
    );
  },

  listByProvider: async (
    providerId: string,
    actor: z.infer<typeof ActorSchema>,
  ) => {
    return await secretReferenceRepository.findByProviderAndActor(
      providerId,
      actor.id,
    );
  },

  delete: async (
    secretId: string,
    requestContext: RequestContext,
  ): Promise<boolean> => {
    const secret = await secretReferenceRepository.findById(secretId);
    if (!secret) {
      throw new NotFoundError("Secret");
    }

    const userSecrets =
      await secretReferenceRepository.findByOrganizationIdAndEnvironmentIds(
        requestContext.organization.id,
        requestContext.environments.map((env) => env.id),
      );
    if (!userSecrets.some((s) => s.id === secretId)) {
      throw new InvalidOperationError(
        "You do not have permission to delete this secret",
      );
    }

    return await secretReferenceRepository.deleteById(secretId);
  },
};
