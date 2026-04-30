import type { ActorModel, SecretProviderModel } from "../../types/models.js";
import { organizationRepository } from "../../repositories/organization.repository.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import type { SecretProvider } from "../../types/secrets.js";
import { secretProviderRepository } from "../../repositories/secretProvider.repository.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import { converterUtils } from "../../utils/converter.utils.js";
import { providerClassMap } from "./providers/providerMap.js";

export const secretProviderService = {
  createNew: async (
    data: SecretProvider,
    actor: ActorModel,
  ): Promise<SecretProviderModel> => {
    const organization = await organizationRepository.findByActorId(actor.id);
    if (!organization) {
      throw new NotFoundError("organization");
    }

    const ProviderClass = providerClassMap[data.type];
    if (!ProviderClass) {
      throw new InvalidOperationError(
        `Secret provider type '${data.type}' is not currently implemented`,
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

    return await secretProviderRepository.insert({
      label: data.label,
      organization_id: organization.id,
      type: data.type,
      configuration: converterUtils.objectToJsonValue(data.configuration),
    });
  },

  getByActor: async (actor: ActorModel): Promise<SecretProviderModel[]> => {
    const organization = await organizationRepository.findByActorId(actor.id);
    if (!organization) {
      throw new NotFoundError("organization");
    }

    return await secretProviderRepository.findByOrganizationId(organization.id);
  },
};
