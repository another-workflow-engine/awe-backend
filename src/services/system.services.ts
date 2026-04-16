import { systemRepository } from "../repositories/system.repository.js";
import {
  organizationService,
  type CreateOrganizationInput,
} from "./organization.services.js";
import { EnvironmentTypes } from "../types/enums.js";
import { db } from "../database.js";
import { environmentRepository } from "../repositories/environment.repository.js";
import { organizationRepository } from "../repositories/organization.repository.js";
import type {
  ActorModel,
  EnvironmentModel,
  OrganizationModel,
  SystemModel,
} from "../types/models.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { environmentService } from "./environment.services.js";

export type CreateProductionSystemInput = {
  organization: CreateOrganizationInput;
  system: { name: string; description?: string | null };
};

export type CreateProductionSystemOutput = {
  organization: OrganizationModel;
  system: SystemModel;
  environment: EnvironmentModel[];
};

export type CurrentSystemOutput = {
  system: SystemModel;
  organization: OrganizationModel;
};

export const systemService = {
  createProduction: async (
    data: CreateProductionSystemInput,
  ): Promise<CreateProductionSystemOutput> => {
    return await db.transaction().execute(async (transaction) => {
      const organization = await organizationService.create(
        data.organization,
        transaction,
      );

      const system = await systemRepository.insert(
        {
          ...data.system,
          organization_id: organization.id,
        },
        transaction,
      );

      const environment = await environmentRepository.insertMany(
        [{
          type: EnvironmentTypes.DEVELOPMENT,
          system_id: system.id,
        }, {
          type: EnvironmentTypes.STAGING,
          system_id: system.id,
        }, {
          type: EnvironmentTypes.PRODUCTION,
          system_id: system.id,
        }],
        transaction,
      );
      return {
        organization,
        system,
        environment,
      };
    });
  },

  getCurrentSystem: async (actor: ActorModel): Promise<CurrentSystemOutput> => {
    const environment = await environmentService.getByActor(actor);

    const system = await systemRepository.findById(environment.system_id);
    if (!system) {
      throw new DataIntegrityError("No system exists for this environment");
    }

    const organization = await organizationRepository.findById(
      system.organization_id,
    );
    if (!organization) {
      throw new DataIntegrityError("No organization exists for this system");
    }

    return {
      system,
      organization,
    };
  },
};
