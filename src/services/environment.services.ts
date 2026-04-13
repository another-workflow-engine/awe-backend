import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { ValidationError } from "../errors/ValidationError.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes } from "../types/enums.js";
import type { ActorModel, EnvironmentModel } from "../types/models.js";
import type { EnvironmentType } from "../types/database.js";

export const environmentService = {
  getAllByActor: async (actor: ActorModel): Promise<EnvironmentModel[]> => {
    if (actor.type == ActorTypes.ORGANIZATION_ACCOUNT) {
      return await environmentRepository.findByOrganizationActorId(actor.id);
    }

    if (actor.type === ActorTypes.API_KEY_CLIENT) {
      return await environmentRepository.findByApiKeyActorId(actor.id);
    }

    return [];
  },

  getByActorAndType: async (
    actor: ActorModel,
    environmentType: EnvironmentType,
  ): Promise<EnvironmentModel> => {
    const environments = await environmentService.getAllByActor(actor);
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

  getByActorAndTypes: async (
    actor: ActorModel,
    environmentTypes: EnvironmentType[],
  ): Promise<EnvironmentModel[]> => {
    const environments = await environmentService.getAllByActor(actor);

    if (environmentTypes.length === 0) {
      return environments;
    }

    const byType = new Map(environments.map((environment) => [environment.type, environment]));
    return environmentTypes
      .map((environmentType) => byType.get(environmentType))
      .filter((environment): environment is EnvironmentModel => Boolean(environment));
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
