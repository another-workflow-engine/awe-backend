import type { Request, Response } from "express";
import {
  SecretProviderIdParamsSchema,
  SecretProviderSchema,
} from "../schemas/secretProvider.schema.js";
import { secretProviderService } from "../services/secrets/secretProvider.service.js";

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

  listSecrets: async (req: Request, res: Response) => {
    const { providerId } = SecretProviderIdParamsSchema.parse(req.params);

    const secrets = await secretProviderService.listSecretKeys(
      providerId,
      req.context.organization,
    );

    return res.status(200).json({ secrets });
  },
};
