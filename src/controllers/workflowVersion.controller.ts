import type { Request, Response } from "express";
import { workflowVersionService } from "../services/workflowVersion.service.js";
import {
  WorkflowVersionCreateRequestSchema,
  WorkflowVersionDetailRequestSchema,
  WorkflowVersionUpdateStatusRequestSchema,
  WorkflowVersionValidateRequestSchema,
} from "../schemas/workflowVersion.schema.js";

export const workflowVersionController = {
  create: async (req: Request, res: Response) => {

    const data = WorkflowVersionCreateRequestSchema.parse({
      ...req.body,
      workflowId: req.params.workflowId, 
      actor: req.actor
    })
    const workflowVersion = await workflowVersionService.createNew(data);

    return res.status(201).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      createdAt: workflowVersion.created_on,
    });
  },

  validate: async (req: Request, res: Response) => {
    const data = WorkflowVersionValidateRequestSchema.parse({
      ...req.params,
      actor: req.actor,
    });

    const { result, workflowVersion } =
      await workflowVersionService.validate(data);

    res.status(200).json({
      valid: result.valid,
      errors: result.errors,
      versionId: workflowVersion.id,
      version: workflowVersion.version,
      status: workflowVersion.status,
    });
  },

  get: async (req: Request, res: Response) => {
    const data = WorkflowVersionDetailRequestSchema.parse({
      ...req.params,
      actor: req.actor,
    });

    const { workflowVersion, nodes, edges } =
      await workflowVersionService.getDetail(data);

    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      publishedAt: "2025-01-15T10:30:00.000Z",
      createdAt: workflowVersion.created_on,
      modifiedAt: workflowVersion.modified_on,
      nodes,
      edges,
    });
  },

  updateStatus: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateStatusRequestSchema.parse({
      ...req.params,
      ...req.body,
      actor: req.actor,
    });

    const workflowVersion = await workflowVersionService.changeStatus(data);

    res.status(200).json({
      version: {
        id: workflowVersion.id,
        version: workflowVersion.version,
        status: workflowVersion.status,
        publishedAt: workflowVersion.published_on,
      },
    });
  },
};
