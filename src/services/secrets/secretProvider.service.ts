import type {
  OrganizationModel,
  SecretProviderModel,
} from "../../types/models.js";
import {
  type ProviderDetail,
  type SecretProvider,
} from "../../types/secrets.js";
import { secretProviderRepository } from "../../repositories/secretProvider.repository.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import { converterUtils } from "../../utils/converter.utils.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { getProvider, getProviderConfiguration } from "./providers/utils.js";

function toProviderDetail(provider: SecretProviderModel): ProviderDetail {
  return {
    id: provider.id,
    label: provider.label,
    type: provider.type,
    configuration: getProviderConfiguration(provider),
    modifiedAt: provider.modified_on,
  };
}

export const secretProviderService = {
  list: async (organization: OrganizationModel): Promise<ProviderDetail[]> => {
    const secretProviders = await secretProviderRepository.findByOrganizationId(
      organization.id,
    );
    return secretProviders.map((provider) => toProviderDetail(provider));
  },

  createNew: async (
    data: SecretProvider,
    organization: OrganizationModel,
  ): Promise<ProviderDetail> => {
    const provider = getProvider({
      label: data.label,
      type: data.type,
      configuration: converterUtils.objectToJsonValue(data.configuration),

      organization_id: organization.id,

      id: "",
      created_on: new Date(),
      modified_on: new Date(),
    });

    const result = await provider.testConnection();

    if (!result.success) {
      const message = result.error ? result.error.message : "Unkown error";
      throw new InvalidOperationError(message, result.error);
    }

    const secretProvider = await secretProviderRepository.insert({
      label: data.label,
      organization_id: organization.id,
      type: data.type,
      configuration: converterUtils.objectToJsonValue(data.configuration),
    });

    return toProviderDetail(secretProvider);
  },

  listSecretKeys: async (
    providerId: string,
    organization: OrganizationModel,
  ): Promise<string[]> => {
    const provider = await secretProviderRepository.findById(providerId);

    if (!provider || provider.organization_id !== organization.id) {
      throw new NotFoundError("Secret Provider");
    }

    const providerInstance = getProvider(provider);
    return await providerInstance.listAllSecretKeys();
  },
};
