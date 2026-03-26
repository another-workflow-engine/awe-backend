import type { Request, Response } from "express";
import { workflowService } from "../services/workflow.service.js";
import {
  WorkflowDefinitionValidateSchema,
  WorkflowGroupCreateSchema,
  WorkflowGroupUpdateSchema,
  WorkflowIdSchema,
} from "../schemas/workflow.schema.js";
import { workflowValidatorService } from "../services/workflowValidator.service.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";

export const workflowGroupController = {
  create: async (req: Request, res: Response) => {
    const { name, description } = WorkflowGroupCreateSchema.parse(req.body);
    const workflow = await workflowService.create(
      { name, description },
      req.actor,
    );

    return res.status(201).json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        createdAt: workflow.created_on,
      },
    });
  },

  list: async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePaginationFromRequest(req);
    const { items, total } = await workflowService.getAllPaginated(
      req.actor,
      limit,
      offset,
    );

    const formattedWorkflows = items.map(
      ({ workflow, latestWorkflowVersion, status }) => {
        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          latestVersion: latestWorkflowVersion,
          status: status,
          createdAt: workflow.created_on,
          updatedAt: workflow.modified_on,
        };
      },
    );

    res
      .status(200)
      .json(
        buildPaginatedResponse("workflows", formattedWorkflows, total, page, limit),
      );
  },

  update: async (req: Request, res: Response) => {
    const data = WorkflowGroupUpdateSchema.parse({
      ...req.params,
      ...req.body,
    });
    const workflow = await workflowService.update(data, req.actor);

    res.status(200).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      updatedAt: workflow.modified_on,
    });
  },

  get: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse({ ...req.params });
    const { workflow, versions } = await workflowService.get(
      workflowId,
      req.actor,
    );
    return res.status(200).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      createdAt: workflow.created_on,
      updatedAt: workflow.modified_on,

      versions: versions.map((version) => {
        return {
          id: version.id,
          description: version.description,
          version: version.version,
          status: version.status,
          createdAt: version.created_on,
          updatedAt: version.modified_on,
        };
      }),
    });
  },

  delete: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse({ ...req.params });
    await workflowService.delete(workflowId, req.actor);
    res.status(200).json({});
  },

  changeStatus: (req: Request, res: Response) => {
    res.status(200).json({
      id: "wf-uuid",
      status: "active",
      updatedAt: "2025-01-15T12:00:00.000Z",
    });
  },

  validate: (req: Request, res: Response) => {
    const data = WorkflowDefinitionValidateSchema.parse(req.body);
    const result = workflowValidatorService.validateDefinition(data.nodes, data.edges);
    res.status(200).json(result);
  },
};
