import { EngineError } from "../../../errors/EngineError.js";
import type { SecretProviderType } from "../../../types/database.js";
import { SecretProviderTypes } from "../../../types/enums.js";
import type { SecretProviderModel } from "../../../types/models.js";
import {
  ProviderConfigurationSchemaMap,
  type SecretProviderConfiguration,
} from "../../../types/secrets.js";
import { converterUtils } from "../../../utils/converter.utils.js";
import type { BaseSecretProvider } from "./BaseSecretProvider.js";
import { InfisicalSecretProvider } from "./InfisicalSecretProvider.js";

type SecretProviderConstructor = new (
  secretProvider: SecretProviderModel,
) => BaseSecretProvider;

export const providerClassMap: Partial<
  Record<SecretProviderType, SecretProviderConstructor>
> = {
  [SecretProviderTypes.INFISICAL]: InfisicalSecretProvider,
};

export function getProvider(provider: SecretProviderModel): BaseSecretProvider {
  const ProviderClass = providerClassMap[provider.type];

  if (!ProviderClass) {
    throw new EngineError(
      `Secret provider type '${provider.type}' not implemented`,
    );
  }

  return new ProviderClass(provider);
}

export function getProviderConfiguration(
  provider: SecretProviderModel,
): SecretProviderConfiguration<SecretProviderType> {
  return converterUtils.parseOrThrow(
    ProviderConfigurationSchemaMap[provider.type],
    provider.configuration,
  );
}
