import type { Request, Response } from "express";
import { apiKeyService } from "../services/apiKey.service.js";
import { z } from "zod";
import { EnvironmentTypes } from "../types/enums.js";
import { EnvironmentQuerySchema } from "../schemas/environment.schema.js";

const apiKeyIdParam = z.object({
  keyId: z.uuidv4(),
});

export const CreateApiKeySchema = z.object({
  label: z.string().min(1),
  environment: z.enum(EnvironmentTypes),
});

export const apiKeyController = {
  list: async (req: Request, res: Response) => {
    console.log(req.query);
    const selectedEnvironments = EnvironmentQuerySchema.parse(
      req.query.environment,
    );
    console.log(selectedEnvironments);

    const apiKeys = await apiKeyService.getAll(
      selectedEnvironments,
      req.context.environments,
    );

    return res.status(200).json({
      apiKeys,
    });
  },

  generate: async (req: Request, res: Response) => {
    const data = CreateApiKeySchema.parse(req.body);

    const { apiKey, rawKey, environment } = await apiKeyService.createNew(
      data,
      req.context.environments,
    );

    return res.status(201).json({
      id: apiKey.id,
      label: apiKey.label,
      environment: environment.type,
      prefix: apiKey.key_prefix,
      apiKey: rawKey,
      createdAt: apiKey.created_on,
    });
  },

  revoke: async (req: Request, res: Response) => {
    const params = apiKeyIdParam.parse(req.params);
    const apiKey = await apiKeyService.revoke(
      params.keyId,
      req.context.environments,
    );

    return res.status(200).json({
      revokedAt: apiKey.revoked_on,
    });
  },
};
