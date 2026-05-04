import type {
  OrganizationModel,
  SecretProviderModel,
} from "../../types/models.js";
import {
  ProviderConfigurationSchemaMap,
  type ProviderDetail,
  type SecretProvider,
} from "../../types/secrets.js";
import { secretProviderRepository } from "../../repositories/secretProvider.repository.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import { converterUtils } from "../../utils/converter.utils.js";
import { providerClassMap } from "./providers/providerMap.js";

function toProviderDetail(provider: SecretProviderModel): ProviderDetail {
  return {
    id: provider.id,
    label: provider.label,
    type: provider.type,
    configuration: converterUtils.parseOrThrow(
      ProviderConfigurationSchemaMap[provider.type],
      provider.configuration,
    ),
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
    const ProviderClass = providerClassMap[data.type];
    if (!ProviderClass) {
      throw new InvalidOperationError(
        `Secret provider type '${data.type}' is not implemented`,
      );
    }

    const provider = new ProviderClass({
      configuration: data.configuration,
      label: data.label,
      organization_id: organization.id,
      type: data.type,
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
};
