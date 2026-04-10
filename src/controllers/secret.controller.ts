import type { Request, Response } from "express";
import { z } from "zod";
import { ActorSchema } from "../schemas/actor.schema.js";
import { secretService } from "../services/secret.service.js";

const createNewSecretSchema = z.object({
  label: z.string(),
  value: z.string(),
  actor: ActorSchema,
});

export const secretController = {
  list: async (req: Request, res: Response) => {
    const secrets = await secretService.getByActor(req.actor);

    return res.status(200).json({
      secrets: secrets.map((secret) => {
        return {
          id: secret.id,
          label: secret.label,
          updatedAt: secret.modified_on,
        };
      }),
    });
  },

  create: async (req: Request, res: Response) => {
    console.log(req.body);
    const { label, value, actor } = createNewSecretSchema.parse({
      ...req.body,
      actor: req.actor,
    });

    const result = await secretService.createNew({ label, value }, actor);

    return res.status(201).json({
      id: result.id,
      label: result.label,
      createdAt: result.created_on,
    });
  },
};
