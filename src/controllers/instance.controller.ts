import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import { InstanceCreateSchema } from "../schemas/instance.schema.js";

export const instanceController = {
  create: async (req: Request, res: Response) => {
    const data = InstanceCreateSchema.parse({ ...req.body });

    const instance = await instanceService.createNew(data, req.actor);

    return res.status(201).json({ instance });
  },
};
