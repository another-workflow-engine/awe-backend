import type { Request, Response } from "express";
import { SecretProviderSchema } from "../schemas/secretProvider.schema.js";
import { secretProviderService } from "../services/secrets/secretProvider.service.js";

export const secretProviderController = {
  list: async (req: Request, res: Response) => {
    const secretProviders = await secretProviderService.getByActor(
      req.context.actor,
    );
    return res.status(200).json({ secretProviders });
  },

  create: async (req: Request, res: Response) => {
    const data = SecretProviderSchema.parse(req.body);
    const secretProvider = await secretProviderService.createNew(
      data,
      req.context.actor,
    );

    return res.status(201).json(secretProvider);
  },
};
