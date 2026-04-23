import type { Request, Response } from "express";
import { workflowVersionService } from "../services/workflowVersion.service.js";
import {
  WorkflowVersionCreateSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionListSchema,
  WorkflowVersionPromoteSchema,
  WorkflowVersionPromoteResponseSchema,
  WorkflowVersionUpdateSchema,
  WorkflowVersionUpdateStatusSchema,
  WorkflowVersionValidateSchema,
} from "../schemas/workflowVersion.schema.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";
import { WorkflowVersionStatuses } from "../types/enums.js";
import { environmentUtils } from "../utils/environment.utils.js";

export const workflowVersionController = {
  list: async (req: Request, res: Response) => {
    const data = WorkflowVersionListSchema.parse({
      ...req.params,
      actor: req.context.actor,
    });
    const { page, limit, offset } = parsePaginationFromRequest(req);

    const { workflow, items, total } =
      await workflowVersionService.listPaginated(
        data,
        limit,
        offset,
        environmentUtils.getEnvironmentIds(req.context.environments),
      );

    const environment = "production";

    const versions = items.map((version) => ({
      id: version.id,
      workflowId: version.workflow_id,
      versionNumber: version.version,
      status: version.status,
      description: version.description,
      publishedAt: version.published_on,
      environment,
      createdAt: version.created_on,
      updatedAt: version.modified_on,
    }));

    return res
      .status(200)
      .json(buildPaginatedResponse("versions", versions, total, page, limit));
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

    const environment = "production";

    return res.status(200).json({
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,
      version: workflowVersion.version,
      status: workflowVersion.status,
      publishedAt: workflowVersion.published_on,
      createdAt: workflowVersion.created_on,
      modifiedAt: workflowVersion.modified_on,
      environment,
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
