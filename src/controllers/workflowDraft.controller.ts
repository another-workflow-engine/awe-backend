import type { Request, Response } from "express";
import { workflowDraftService } from "../services/workflows/workflowDraft.service.js";
import {
  DraftCreateRequestSchema,
  DraftDetailRequestSchema,
  DraftIdSchema,
  DraftListRequestSchema,
  DraftPublishRequestSchema,
  DraftUpdateRequestSchema,
} from "../schemas/workflowDraft.schema.js";

export const workflowDraftController = {
  list: async (req: Request, res: Response) => {
    const data = DraftListRequestSchema.parse(req.params);

    const result = await workflowDraftService.listPaginated(
      data,
      req.context.organization,
    );

    return res.status(200).json(result);
  },

  create: async (req: Request, res: Response) => {
    const data = DraftCreateRequestSchema.parse({
      ...req.body,
      ...req.params,
    });

    const result = await workflowDraftService.createNew(
      data,
      req.context.actor,
    );

    return res.status(201).json(result);
  },

  get: async (req: Request, res: Response) => {
    const data = DraftDetailRequestSchema.parse({
      ...req.params,
      ...req.query,
    });

    const result = await workflowDraftService.getDetail(
      data,
      req.context.organization,
    );

    return res.status(200).json(result);
  },

  update: async (req: Request, res: Response) => {
    const data = DraftUpdateRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const result = await workflowDraftService.update(
      data,
      req.context.actor,
      req.context.organization,
    );

    return res.status(200).json(result);
  },

  validate: async (req: Request, res: Response) => {
    const { draftId } = DraftIdSchema.parse(req.params);

    const result = await workflowDraftService.validate(
      draftId,
      req.context.organization,
    );

    res.status(200).json(result);
  },

  delete: async (req: Request, res: Response) => {
    const { draftId } = DraftIdSchema.parse(req.params);

    await workflowDraftService.delete(
      draftId,
      req.context.actor,
      req.context.organization,
    );

    return res.status(204).end();
  },

  publish: async (req: Request, res: Response) => {
    const data = DraftPublishRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const result = await workflowDraftService.publish(
      data,
      req.context.actor,
      req.context.organization,
      req.context.environments,
    );

    return res.status(200).json(result);
  },

  clone: async (req: Request, res: Response) => {
    const { draftId } = DraftIdSchema.parse(req.params);

    const result = await workflowDraftService.clone(
      draftId,
      req.context.actor,
      req.context.organization,
    );

    return res.status(201).json(result);
  },
};
