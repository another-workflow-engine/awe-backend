import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes } from "../types/enums.js";
import type { ActorModel, EnvironmentModel } from "../types/models.js";

export const environmentService = {
  getByActor: async (actor: ActorModel) => {
    let environment: EnvironmentModel | undefined;

    if (actor.type == ActorTypes.ORGANIZATION_ACCOUNT) {
      environment = (
        await environmentRepository.findByOrganizationActorId(actor.id)
      )[0];
    } else if (actor.type === ActorTypes.API_KEY_CLIENT) {
      environment = (
        await environmentRepository.findByApiKeyActorId(actor.id)
      )[0];
    }

    if (!environment) {
      throw new DataIntegrityError(
        `No environment exists for Actor = ${actor}`,
      );
    }

    return environment;
  },
};
