import z from "zod";
import { SecretProviderTypes } from "../types/enums.js";

export const InfisicalConfigurationSchema = z.object({
  host: z.string(),
  projectId: z.string(),
  environment: z.string(),
  machineIdentityId: z.string(),
});

export const SecretProviderSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal(SecretProviderTypes.INFISICAL),
      configuration: InfisicalConfigurationSchema,
    }),
  ])
  .and(
    z.object({
      label: z.string(),
    }),
  );
