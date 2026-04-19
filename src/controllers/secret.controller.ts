import type { Request, Response } from "express";
import { z } from "zod";
import { ActorSchema } from "../schemas/actor.schema.js";
import { secretService } from "../services/secrets/secret.service.js";
import { EnvironmentTypes } from "../types/enums.js";
import { parseEnvironmentsFromQuery } from "../utils/environment.utils.js";
import type { EnvironmentType } from "../types/database.js";

export const CreateNewSecretSchema = z.object({
  providerId: z.uuidv4(),
  environment: z.enum(
    Object.values(EnvironmentTypes) as [EnvironmentType, ...EnvironmentType[]],
  ),
  label: z.string(),
  key: z.string(),
  actor: ActorSchema,
});

const mapSecret = (s: {
  id: string;
  provider_id: string;
  label: string;
  secret_key: string;
  created_on: Date | string | null;
  environment?: string;
}) => ({
  id: s.id,
  providerId: s.provider_id,
  label: s.label,
  key: s.secret_key,
  environment: s.environment ?? null,
  createdAt: s.created_on,
});

export const secretController = {
  create: async (req: Request, res: Response) => {
    const data = CreateNewSecretSchema.parse({
      ...req.body,
      actor: req.context.actor,
    });

    const result = await secretService.createNew(data);

    return res.status(201).json({
      id: result.id,
      providerId: result.provider_id,
      environment: data.environment,
      label: result.label,
      key: result.secret_key,
      createdAt: result.created_on,
    });
  },

  list: async (req: Request, res: Response) => {
    const environments = parseEnvironmentsFromQuery(req.query.environment);
    const result = await secretService.list(environments, req.context);
    return res.status(200).json({
      secrets: result.map(mapSecret),
    });
  },

  listByProvider: async (req: Request, res: Response) => {
    const providerId = req.params.providerId as string;
    const result = await secretService.listByProvider(
      providerId,
      req.context.actor,
    );
    return res.status(200).json({
      secrets: result.map(mapSecret),
    });
  },
  delete: async (req: Request, res: Response) => {
    const secretId = req.params.secretId as string;
    const deleted = await secretService.delete(secretId, req.context);

    if (!deleted) {
      return res.status(404).json({
        error: "Secret not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Secret deleted successfully",
    });
  },
};
