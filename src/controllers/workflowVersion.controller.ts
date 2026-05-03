import type { Request, Response } from "express";
import { workflowVersionService } from "../services/workflowVersion.service.js";
import {
  WorkflowVersionCreateSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionListRequestSchema,
  WorkflowVersionPromoteSchema,
  WorkflowVersionPromoteResponseSchema,
  WorkflowVersionUpdateSchema,
  WorkflowVersionUpdateStatusSchema,
  WorkflowVersionValidateSchema,
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
    const data = WorkflowVersionCreateSchema.parse({
      ...req.body,
      workflowId: req.params.workflowId,
    });

    const { workflowVersion, result } = await workflowVersionService.createNew(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(201).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      status: workflowVersion.status,
      createdAt: workflowVersion.created_on,
      valid: result.valid,
      errors: result.errors,
      warnings: (result as unknown as { warnings?: unknown[] }).warnings ?? [],
    });
  },

  validate: async (req: Request, res: Response) => {
    const data = WorkflowVersionValidateSchema.parse({
      versionId: req.params.versionId,
    });

    const { result, workflowVersion } = await workflowVersionService.validate(
      data,
      req.context.environments,
    );

    res.status(200).json({
      valid: result.valid,
      errors: result.errors,
      status: workflowVersion.status,
    });
  },

  get: async (req: Request, res: Response) => {
    const data = WorkflowVersionDetailSchema.parse({
      versionId: req.params.versionId,
      actor: req.context.actor,
    });

    const { workflow, workflowVersion, nodes, edges, startVariables } =
      await workflowVersionService.getDetail(data, req.context.environments);

    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      publishedAt: workflowVersion.published_on,
      createdAt: workflowVersion.created_on,
      updatedAt: workflowVersion.modified_on,
      environment: req.context.environments.find(
        (env) => env.id === workflow.environment_id,
      )?.type,
      nodes,
      edges,
      startVariables,
    });
  },

  update: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateSchema.parse({
      versionId: req.params.versionId,
      ...req.body,
    });
    const { workflowVersion, result } = await workflowVersionService.update(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json({
      valid: result.valid,
      errors: result.errors,
      status: workflowVersion.status,
    });
  },

  publish: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateStatusSchema.parse({
      versionId: req.params.versionId,
      status: WorkflowVersionStatuses.PUBLISHED,
      ...req.body,
    });
    const workflowVersion = await workflowVersionService.changeStatus(
      data,
      req.context.actor,
      req.context.environments,
    );
    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      publishedAt: workflowVersion.published_on,
    });
  },

  activate: async (req: Request, res: Response) => {
    const data = WorkflowVersionUpdateStatusSchema.parse({
      versionId: req.params.versionId,
      status: WorkflowVersionStatuses.ACTIVE,
      ...req.body,
    });
    const workflowVersion = await workflowVersionService.changeStatus(
      data,
      req.context.actor,
      req.context.environments,
    );
    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      publishedAt: workflowVersion.published_on,
    });
  },

  clone: async (req: Request, res: Response) => {
    const data = WorkflowVersionDetailSchema.parse({
      versionId: req.params.versionId,
      actor: req.context.actor,
    });
    const clonedVersion = await workflowVersionService.clone(
      data,
      req.context.actor,
      req.context.environments,
    );
    return res.status(201).json(clonedVersion);
  },

  promote: async (req: Request, res: Response) => {
    const data = WorkflowVersionPromoteSchema.parse({
      versionId: req.params.versionId,
      actor: req.context.actor,
    });

    const result = await workflowVersionService.promote(
      data,
      req.context.actor,
      req.context.environments,
    );
    const response = WorkflowVersionPromoteResponseSchema.parse(result);
    return res.status(201).json(response);
  },
};
