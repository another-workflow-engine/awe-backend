import type z from "zod";
import {
  InfisicalConfigurationSchema,
  type SecretProviderSchema,
} from "../schemas/secretProvider.schema.js";
import { SecretProviderTypes } from "./enums.js";
import type { SecretProviderType } from "./database.js";

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
