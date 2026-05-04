import type z from "zod";
import {
  InfisicalConfigurationSchema,
  type SecretProviderSchema,
} from "../schemas/secretProvider.schema.js";
import { SecretProviderTypes } from "./enums.js";
import type { EnvironmentType, SecretProviderType } from "./database.js";
import type { Insertable } from "kysely";
import type { SecretProvider as SecretProviderModel } from "./database.js";

export type SecretProvider = z.infer<typeof SecretProviderSchema>;

export type InfisicalConfiguration = z.infer<
  typeof InfisicalConfigurationSchema
>;

export const ProviderConfigurationSchemaMap = {
  [SecretProviderTypes.INFISICAL]: InfisicalConfigurationSchema,
  [SecretProviderTypes.DEFAULT]: InfisicalConfigurationSchema,
  [SecretProviderTypes.AWS_SECRETS_MANAGER]: InfisicalConfigurationSchema,
} as const;

export type SecretProviderConfiguration<T extends SecretProviderType> = z.infer<
  (typeof ProviderConfigurationSchemaMap)[T]
>;

export type NewSecretProvider = Insertable<SecretProviderModel>;

export type ProviderDetail = {
  id: string;
  label: string;
  type: SecretProviderType;
  configuration: SecretProviderConfiguration<SecretProviderType>;
  modifiedAt: Date;
};

export type SecretDetail = {
  id: string;
  environment: EnvironmentType;
  key: string;

  provider: {
    id: string;
    label: string;
  };

  createdAt: Date;
};
