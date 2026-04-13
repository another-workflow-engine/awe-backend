import type { SecretProviderType } from "../../../types/database.js";
import { SecretProviderTypes } from "../../../types/enums.js";
import type { SecretProviderModel } from "../../../types/models.js";
import type { BaseSecretProvider } from "./BaseSecretProvider.js";
import { InfisicalSecretProvider } from "./InfisicalSecretProvider.js";

type SecretProviderConstructor = new (
  secretProvider: SecretProviderModel,
) => BaseSecretProvider;

export const providerClassMap: Record<
  SecretProviderType,
  SecretProviderConstructor
> = {
  [SecretProviderTypes.INFISICAL]: InfisicalSecretProvider,
};
