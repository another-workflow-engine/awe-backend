import type { Request, Response } from "express";
import { secretService } from "../services/secrets/secret.service.js";
import {
  CreateNewSecretRequestSchema,
  ListSecretRequestSchema,
} from "../schemas/secret.schema.js";

export const secretController = {
  create: async (req: Request, res: Response) => {
    const data = CreateNewSecretRequestSchema.parse(req.body);

    const secretDetail = await secretService.createNew(
      data,
      req.context.environments,
    );

    return res.status(201).json(secretDetail);
  },

  list: async (req: Request, res: Response) => {
    const data = ListSecretRequestSchema.parse(req.query);

    const secrets = await secretService.list(data, req.context.environments);

    return res.status(200).json({
      secrets,
    });
  },

  delete: async (req: Request, res: Response) => {
    const secretId = req.params.secretId as string;

    await secretService.delete(secretId, req.context.environments);

    return res.status(204).end();
  },
};
