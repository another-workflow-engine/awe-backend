import { secretReferenceRepository } from "../../repositories/secretReference.repository.js";
import { EngineError } from "../../errors/EngineError.js";
import { secretProviderRepository } from "../../repositories/secretProvider.repository.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import type { EnvironmentType } from "../../types/database.js";
import type {
  EnvironmentModel,
  SecretProviderModel,
  SecretReferenceModel,
} from "../../types/models.js";
import type {
  CreateNewSecretInput,
  ListSecretInput,
} from "../../schemas/secret.schema.js";
import type { SecretDetail } from "../../types/secrets.js";
import { environmentUtils } from "../../utils/environment.utils.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { getProvider } from "./providers/utils.js";

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

function toSecretDetail(
  secret: SecretReferenceModel,
  provider: SecretProviderModel,
  environmentType: EnvironmentType,
): SecretDetail {
  return {
    id: secret.id,
    environment: environmentType,
    key: secret.secret_key,

    provider: {
      id: provider.id,
      label: provider.label,
    },

    createdAt: secret.created_on,
  };
}

export const secretService = {
  createNew: async (
    data: CreateNewSecretInput,
    environments: EnvironmentModel[],
  ): Promise<SecretDetail> => {
    const environment = environments.find((env) => {
      if (env.type === data.environment) {
        return env;
      }
    });

    if (!environment) {
      throw new InvalidOperationError(
        `You do not have access to an environment of type ${data.environment}`,
      );
    }

    const providerModel = await secretProviderRepository.findById(
      data.providerId,
    );
    if (!providerModel) {
      throw new NotFoundError("Secret provider");
    }

    const provider = getProvider(providerModel);
    const result = await provider.testSecretExists(data.key);

    if (!result.success) {
      const message = result.error ? result.error.message : "Unkown error";
      throw new InvalidOperationError(message, result.error);
    }

    const secretReference = await secretReferenceRepository.insert({
      provider_id: data.providerId,
      environment_id: environment.id,
      secret_key: data.key,
    });

    return toSecretDetail(secretReference, providerModel, environment.type);
  },

  list: async (
    data: ListSecretInput,
    environments: EnvironmentModel[],
  ): Promise<SecretDetail[]> => {
    const selectedEnvironmentIds = environmentUtils.getFilteredEnvironmentIds(
      environments,
      data.environment,
    );

    if (selectedEnvironmentIds.length === 0) {
      return [];
    }

    const items = await secretReferenceRepository.findByEnvironmentIds(
      selectedEnvironmentIds,
      data.providerId
    );

    return items.map(({ secretReference, secretProvider }) => {
      const environment = environments.find(
        (env) => env.id === secretReference.environment_id,
      );
      if (!environment) {
        throw new DataIntegrityError(
          `Environment id=${secretReference.environment_id} does not exist within request context`,
        );
      }

      return toSecretDetail(secretReference, secretProvider, environment.type);
    });
  },

  delete: async (
    secretId: string,
    environments: EnvironmentModel[],
  ): Promise<void> => {
    const secret = await secretReferenceRepository.findById(secretId);
    if (
      !secret ||
      !environments.find((env) => env.id === secret.environment_id)
    ) {
      throw new NotFoundError("Secret");
    }

    await secretReferenceRepository.deleteById(secretId);

    return;
  },

  getByIds: async (secretIds: string[]): Promise<Record<string, string>> => {
    if (secretIds.length === 0) {
      return {};
    }

    const referenceMap =
      await secretReferenceRepository.findByIdsWithProviders(secretIds);

    const secrets: Record<string, string> = {};

    for (const [provider, references] of referenceMap) {
      const providerInstance = getProvider(provider);

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

  getSecretKeysByProviderId: async (providerId: string): Promise<Omit<SecretReferenceModel, "provider_id" | "environment_id" | "created_on">[]> => {
    const provider = await secretProviderRepository.findById(providerId);
    if (!provider) {
      throw new NotFoundError("Secret provider");
    }
    return await secretReferenceRepository.findKeysByProviderId(providerId);
  },
};
