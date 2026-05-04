import type { Request, Response } from "express";
import { workflowVersionService } from "../services/workflowVersion.service.js";
import {
  WorkflowVersionCreateRequestSchema,
  WorkflowVersionIdSchema,
  WorkflowVersionListRequestSchema,
  WorkflowVersionPromoteResponseSchema,
  WorkflowVersionUpdateRequestSchema,
  WorkflowVersionUpdateStatusRequestSchema,
} from "../schemas/workflowVersion.schema.js";
import { WorkflowVersionStatuses } from "../types/enums.js";

export const workflowVersionController = {
  list: async (req: Request, res: Response) => {
    const data = WorkflowVersionListRequestSchema.parse(req.params);

    const result = await workflowVersionService.listPaginated(
      data,
      req.context.environments,
    );

    return res.status(200).json(result);
  },

  create: async (req: Request, res: Response) => {
    const data = WorkflowVersionCreateRequestSchema.parse({
      ...req.body,
      ...req.params,
    });

    const metadata = await workflowVersionService.createNew(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(201).json(metadata);
  },

  get: async (req: Request, res: Response) => {
    const { versionId } = WorkflowVersionIdSchema.parse(req.params);

    const { workflowVersion, nodes, edges, startVariables, modifiedBy } =
      await workflowVersionService.getDetail(
        versionId,
        req.context.environments,
      );

    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,

      version: workflowVersion.version,
      status: workflowVersion.status,

      publishedAt: workflowVersion.published_on,

      modifiedAt: workflowVersion.modified_on,
      modifiedBy,

      nodes,
      edges,
      startVariables,
    });
  },

  update: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const metadata = await workflowVersionService.update(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json(metadata);
  },

  validate: async (req: Request, res: Response) => {
    const { versionId } = WorkflowVersionIdSchema.parse(req.params);

    const metadata = await workflowVersionService.validate(
      versionId,
      req.context.environments,
    );

    res.status(200).json(metadata);
  },

  publish: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateStatusRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const { workflowVersion } = await workflowVersionService.changeStatus(
      data,
      WorkflowVersionStatuses.PUBLISHED,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json(workflowVersion);
  },

  activate: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateStatusRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const { workflowVersion } = await workflowVersionService.changeStatus(
      data,
      WorkflowVersionStatuses.ACTIVE,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json(workflowVersion);
  },

  clone: async (req: Request, res: Response) => {
    const { versionId } = WorkflowVersionIdSchema.parse(req.params);
    const clonedVersion = await workflowVersionService.clone(
      versionId,
      req.context.actor,
      req.context.environments,
    );
    return res.status(201).json(clonedVersion);
  },

  promote: async (req: Request, res: Response) => {
    const { versionId } = WorkflowVersionIdSchema.parse(req.params);

    const result = await workflowVersionService.promote(
      versionId,
      req.context.actor,
      req.context.environments,
    );

    const response = WorkflowVersionPromoteResponseSchema.parse(result);

    return res.status(201).json(response);
  },
};
