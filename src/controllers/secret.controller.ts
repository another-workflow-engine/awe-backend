import type { Request, Response } from "express";
import { z } from "zod";
import { ActorSchema } from "../schemas/actor.schema.js";
import { secretService } from "../services/secrets/secret.service.js";
import { EnvironmentTypes } from "../types/enums.js";

export const CreateNewSecretSchema = z.object({
  providerId: z.uuidv4(),
  environmentType: z.enum(EnvironmentTypes),
  label: z.string(),
  key: z.string(),
  actor: ActorSchema,
});

export const secretController = {
  create: async (req: Request, res: Response) => {
    const data = CreateNewSecretSchema.parse({
      ...req.body,
      actor: req.actor,
    });

    const result = await secretService.createNew(data);

    return res.status(201).json({
      id: result.id,
      label: result.label,
      createdAt: result.created_on,
    });
  },
};
