import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { ValidationError } from "../errors/ValidationError.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes } from "../types/enums.js";
import type { ActorModel, EnvironmentModel } from "../types/models.js";
import type { EnvironmentType } from "../types/database.js";

export const environmentService = {
  getByActorAndType: async (
    actor: ActorModel,
    environmentType: EnvironmentType,
  ): Promise<EnvironmentModel> => {
    let environments: EnvironmentModel[] = [];

    if (actor.type == ActorTypes.ORGANIZATION_ACCOUNT) {
      environments = await environmentRepository.findByOrganizationActorId(actor.id);
    } else if (actor.type === ActorTypes.API_KEY_CLIENT) {
      environments = await environmentRepository.findByApiKeyActorId(actor.id);
    }

    const environment = environments.find((env) => env.type === environmentType);

    if (!environment) {
      throw new ValidationError("Invalid environmentType for this actor", [
        {
          field: "environmentType",
          message: `Environment ${environmentType} is not available for this actor`,
        },
      ]);
    }

    return environment;
  },

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
