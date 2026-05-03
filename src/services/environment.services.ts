import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes, EnvironmentTypes } from "../types/enums.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
} from "../types/models.js";

export const environmentService = {
  createAllEnvironments: async (
    organizationId: string,
    transaction: DbTransaction,
  ): Promise<EnvironmentModel[]> => {
    return await environmentRepository.insertMany(
      [
        {
          type: EnvironmentTypes.DEVELOPMENT,
          organization_id: organizationId,
        },
        {
          type: EnvironmentTypes.STAGING,
          organization_id: organizationId,
        },
        {
          type: EnvironmentTypes.PRODUCTION,
          organization_id: organizationId,
        },
      ],
      transaction,
    );
  },

  getAllByActor: async (actor: ActorModel): Promise<EnvironmentModel[]> => {
    if (actor.type == ActorTypes.ORGANIZATION_ACCOUNT) {
      return await environmentRepository.findByOrganizationId(actor.id);
    }

    if (actor.type === ActorTypes.API_KEY_CLIENT) {
      return await environmentRepository.findByApiKeyActorId(actor.id);
    }

    return [];
  },

  getByActor: async (actor: ActorModel) => {
    const environment = (await environmentService.getAllByActor(actor))[0];

    if (!environment) {
      throw new DataIntegrityError(
        `No environment exists for Actor = ${actor}`,
      );
    }

    return environment;
  },
};
