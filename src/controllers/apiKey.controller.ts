import type { Request, Response } from "express";
import { apiKeyService } from "../services/apiKey.service.js";
import { z } from "zod";
import { EnvironmentTypes } from "../types/enums.js";
import type { EnvironmentType } from "../types/database.js";

const apiKeyIdParam = z.object({
  keyId: z.uuidv4(),
});

const createApiKeySchema = z.object({
  label: z.string().trim().min(1, "Label cannot be empty").optional(),
  environment: z.enum(
    Object.values(EnvironmentTypes) as [EnvironmentType, ...EnvironmentType[]],
  ),
});

export const apiKeyController = {
  list: async (req: Request, res: Response) => {
    const apiKeys = await apiKeyService.getAll(req.actor);

    return res.status(200).json({
      apiKeys: apiKeys.map((apiKey) => {
        return {
          id: apiKey.id,
          label: apiKey.label,
          isRevoked: apiKey.is_revoked,
          createdAt: apiKey.created_on,
          revokedAt: apiKey.revoked_on,
          environment: apiKey.environment,
        };
      }),
    });
  },

  generate: async (req: Request, res: Response) => {
    const { label, environment } = createApiKeySchema.parse(req.body);

    const { apiKey, rawKey } = await apiKeyService.createNew(
      label,
      environment,
      req.actor,
    );

    return res.status(201).json({
      id: apiKey.id,
      label: apiKey.label,
      environment,
      apiKey: rawKey,
      createdAt: apiKey.created_on,
    });
  },

  revoke: async (req: Request, res: Response) => {
    const params = apiKeyIdParam.parse(req.params);
    const apiKey = await apiKeyService.revoke(params.keyId, req.actor);

    return res.status(200).json({
      id: apiKey.id,
      label: apiKey.label,
      isRevoked: apiKey.is_revoked,
      revokedAt: apiKey.revoked_on,
    });
  },
};
