import type z from "zod";
import type { SecretProviderType } from "../../../types/database.js";
import type { SecretProviderModel } from "../../../types/models.js";
import {
  ProviderConfigurationSchemaMap,
  type SecretProviderConfiguration,
} from "../../../types/secrets.js";
import { converterUtils } from "../../../utils/converter.utils.js";

export type ProviderTestResult = {
  success: boolean;
  error?: Error | undefined;
};

export abstract class BaseSecretProvider<
  T extends SecretProviderType = SecretProviderType,
> {
  protected configuration: SecretProviderConfiguration<T>;

  constructor(secretProvider: SecretProviderModel) {
    const configurationObject = converterUtils.jsonValueToObject(
      secretProvider.configuration,
    );
    this.configuration = converterUtils.parseOrThrow(
      ProviderConfigurationSchemaMap[
        secretProvider.type
      ] as unknown as z.ZodType<SecretProviderConfiguration<T>>,
      configurationObject,
    );
  }
  abstract testConnection(): Promise<ProviderTestResult>;
  abstract testSecretExists(secretKey: string): Promise<ProviderTestResult>;
  abstract fetchSecrets(secretKeys: string[]): Promise<Record<string, string>>;
}
