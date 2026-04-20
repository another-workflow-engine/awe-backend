import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { ValidationError } from "../errors/ValidationError.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { ActorTypes, EnvironmentTypes } from "../types/enums.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
} from "../types/models.js";
import type { EnvironmentType } from "../types/database.js";

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

  getByActorAndEnvironment: async (
    actor: ActorModel,
    environment: EnvironmentType,
  ): Promise<EnvironmentModel> => {
    const environments = await environmentService.getAllByActor(actor);
    const selectedEnvironment = environments.find(
      (env) => env.type === environment,
    );

    if (!selectedEnvironment) {
      throw new ValidationError("Invalid environment for this actor", [
        {
          field: "environment",
          message: `Environment ${environment} is not available for this actor`,
        },
      ]);
    }

    return selectedEnvironment;
  },

  getByActorAndEnvironments: async (
    actor: ActorModel,
    environments: EnvironmentType[],
  ): Promise<EnvironmentModel[]> => {
    const availableEnvironments = await environmentService.getAllByActor(actor);

    if (environments.length === 0) {
      return availableEnvironments;
    }

    const byType = new Map(
      availableEnvironments.map((availableEnvironment) => [
        availableEnvironment.type,
        availableEnvironment,
      ]),
    );
    return environments
      .map((environment) => byType.get(environment))
      .filter((environment): environment is EnvironmentModel =>
        Boolean(environment),
      );
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
