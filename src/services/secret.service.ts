import type { ActorModel } from "../types/models.js";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { organizationRepository } from "../repositories/organization.repository.js";
import { environmentService } from "./environment.services.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import Config from "../config.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import { secretRepository } from "../repositories/secret.repository.js";
import { env } from "process";

export const secretsClient = new SecretsManagerClient({
  region: "ap-south-1",
});

export async function createSecret(params: {
  tenantId: string;
  secretId: string;
  value: string;
  kmsKeyId: string;
}) {
  return;
}

export const secretService = {
  createNew: async (
    data: { label: string; value: string },
    actor: ActorModel,
  ) => {
    const organization = await organizationRepository.findByActorId(actor.id);
    if (!organization) {
      throw new NotFoundError("organization");
    }
    const environment = await environmentService.getByActor(actor);

    const name = `org/${organization.id}/env/${environment.id}/secret/${data.label}`;

    const command = new CreateSecretCommand({
      Name: name,
      SecretString: data.value,
      KmsKeyId: Config.KMS_ARN,
    });

    const result = await secretsClient.send(command);

    if (!result.Name) {
      throw new InvalidOperationError("Failed to create new secret");
    }

    return await secretRepository.insert({
      organization_id: organization.id,
      environment_id: environment.id,
      label: data.label,
      secret_key: result.Name,
    });
  },

  getByActor: async (actor: ActorModel) => {
    const organization = await organizationRepository.findByActorId(actor.id);
    if (!organization) {
      throw new NotFoundError("organization");
    }

    return await secretRepository.findByOrganizationId(organization.id);
  },
};
