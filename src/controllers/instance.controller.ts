import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import {
  InstanceCreateSchema,
  InstanceParamsSchema,
} from "../schemas/instance.schema.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";

export const instanceController = {
  list: async (req: Request, res: Response) => {
    const instances = await instanceService.listAll(req.actor.id);
    return res.json({ instances });
  },

  create: async (req: Request, res: Response) => {
    const data = InstanceCreateSchema.parse({ ...req.body });
    const instance = await instanceService.createNew(data, req.actor);
    return res.status(201).json({ instance });
  },

  getById: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceService.getById(instanceId, req.actor.id);
    if (!instance) throw new NotFoundError(`Instance id=${instanceId} not found`);
    return res.json({ instance });
  },

  advance: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceService.advanceInstance(instanceId, req.actor.id);
    return res.json({ instance });
  },

  getExecutionLogs: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);

    const instance = await instanceService.getById(instanceId, req.actor.id);
    if (!instance) throw new NotFoundError(`Instance id=${instanceId} not found`);

    const executions = await taskExecutionRepository.findByInstanceId(instanceId);
    return res.json({ executions });
  },
};
