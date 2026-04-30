import type { SecretProviderType } from "../../../types/database.js";
import { SecretProviderTypes } from "../../../types/enums.js";
import type { NewSecretProvider } from "../../../types/secrets.js";
import type { BaseSecretProvider } from "./BaseSecretProvider.js";
import { InfisicalSecretProvider } from "./InfisicalSecretProvider.js";

type SecretProviderConstructor = new (
  secretProvider: NewSecretProvider,
) => BaseSecretProvider;

export const providerClassMap: Partial<
  Record<SecretProviderType, SecretProviderConstructor>
> = {
  [SecretProviderTypes.INFISICAL]: InfisicalSecretProvider,
};
