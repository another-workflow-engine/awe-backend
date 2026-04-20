import argon2 from "argon2";
import { db } from "../database.js";
import { ActorTypes } from "../types/enums.js";
import { actorRepository } from "../repositories/actor.repository.js";
import { organizationRepository } from "../repositories/organization.repository.js";
import type { EnvironmentModel, OrganizationModel } from "../types/models.js";
import { environmentService } from "./environment.services.js";

export const organizationService = {
  register: async (data: {
    name: string;
    email: string;
    password: string;
  }): Promise<{
    organization: OrganizationModel;
    environments: EnvironmentModel[];
  }> => {
    return await db.transaction().execute(async (transaction) => {
      const actor = await actorRepository.insert(
        { type: ActorTypes.ORGANIZATION_ACCOUNT },
        transaction,
      );

      const passwordHash = await argon2.hash(data.password);

      const organization = await organizationRepository.insert(
        {
          actor_id: actor.id,
          name: data.name,
          email: data.email,
          password_hash: passwordHash,
        },
        transaction,
      );

      const environments = await environmentService.createAllEnvironments(
        organization.id,
        transaction,
      );

      return {
        organization,
        environments,
      };
    });
  },

  getByActorIdWithEnvironments: async (
    actorId: string,
  ): Promise<
    | {
        organization: OrganizationModel;
        environments: EnvironmentModel[];
      }
    | undefined
  > => {
    return await organizationRepository.findByActorIdWithEnvironments(actorId);
  },
};
