import type { Request, Response } from "express";
import {
  SecretProviderIdParamsSchema,
  SecretProviderSchema,
} from "../schemas/secretProvider.schema.js";
import { secretProviderService } from "../services/secrets/secretProvider.service.js";
import { secretService } from "../services/secrets/secret.service.js";
import type { SecretReferenceModel } from "../types/models.js";

export const secretProviderController = {
  list: async (req: Request, res: Response) => {
    const secretProviders = await secretProviderService.list(
      req.context.organization,
    );
    return res.status(200).json({ secretProviders });
  },

  create: async (req: Request, res: Response) => {
    const data = SecretProviderSchema.parse(req.body);
    const secretProvider = await secretProviderService.createNew(
      data,
      req.context.organization,
    );

    return res.status(201).json(secretProvider);
  },

  listSecrets: async (req: Request, res: Response) =>  {
    const { providerId } = SecretProviderIdParamsSchema.parse(req.params);


    const [existingKeys, secrets] = await Promise.all([
      secretService.getSecretKeysByProviderId(providerId),
      secretProviderService.listSecretKeys(
        providerId,
        req.context.organization
      )
    ]);

    const result = secrets.map((secret) => ({
      secret,
      referenceId: existingKeys.find((existing) => existing.secret_key === secret)?.id || null,
    }));

    return res.status(200).json({ secrets: result });
  },
};
