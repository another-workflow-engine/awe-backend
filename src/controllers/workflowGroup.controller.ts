import type { Request, Response } from "express";
import { workflowService } from "../services/workflow.service.js";
import {
  WorkflowGroupCreateSchema,
  WorkflowGroupUpdateSchema,
  WorkflowIdSchema,
} from "../schemas/workflow.schema.js";

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
    const workflows = await workflowService.getAll(req.actor);
    const formattedWorkflows = workflows.map(
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

    res.status(200).json({
      workflows: formattedWorkflows,
      pagination: {
        total: formattedWorkflows.length,
        page: 1,
        limit: formattedWorkflows.length,
        totalPages: 1,
      },
    });
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
    res.status(200).json({ valid: true, errors: [] });
  },
};
