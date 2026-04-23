import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import {
  InstanceCreateSchema,
  InstanceParamsSchema,
} from "../schemas/instance.schema.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";
import { instanceSignalService } from "../services/instanceSignal.service.js";
import { environmentUtils } from "../utils/environment.utils.js";

export const instanceController = {
  list: async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePaginationFromRequest(req);

    const selectedEnvironments =
      environmentUtils.parseEnvironmentsFromQueryString(req.query.environment);

    const { items, total } = await instanceService.getPaginated(
      { limit, offset, selectedEnvironments },
      req.context.environments,
    );

    return res
      .status(200)
      .json(buildPaginatedResponse("instances", items, total, page, limit));
  },

  create: async (req: Request, res: Response) => {
    const data = InstanceCreateSchema.parse({ ...req.body });
    const instanceDetail = await instanceService.createNew(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(201).json(instanceDetail);
  },

  get: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instanceDetail = await instanceService.get(
      instanceId,
      req.context.environments,
    );

    return res.status(200).json(instanceDetail);
  },

  resume: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instanceDetail = await instanceService.resume(
      instanceId,
      req.context.actor,
      req.context.environments,
    );
    return res.status(200).json(instanceDetail);
  },

  pause: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instanceDetail = await instanceSignalService.signalPause(
      instanceId,
      req.context.actor,
      req.context.environments,
    );
    return res.status(200).json(instanceDetail);
  },

  terminate: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instanceDetail = await instanceSignalService.signalTerminate(
      instanceId,
      req.context.actor,
      req.context.environments,
    );
    return res.status(200).json(instanceDetail);
  },

  getExecutionSequence: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const sequence = await instanceService.getExecutionSequence(
      instanceId,
      req.context.environments,
    );
    return res.status(200).json({ sequence });
  },
};
