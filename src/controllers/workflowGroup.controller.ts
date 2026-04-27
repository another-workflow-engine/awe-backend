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
import { z } from "zod";
import { environmentUtils } from "../utils/environment.utils.js";

const WorkflowListQuerySchema = z.object({
  search: z.string().trim().optional(),
  createdSort: z.enum(["asc", "desc"]).default("desc"),
});

export const workflowGroupController = {
  create: async (req: Request, res: Response) => {
    const data = WorkflowGroupCreateSchema.parse(req.body);

    const workflow = await workflowService.create(
      data,
      req.context.actor,
      req.context.environments,
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
    const { search, createdSort } = WorkflowListQuerySchema.parse(req.query);
    const listQuery = {
      createdSort,
      ...(search ? { search } : {}),
    };

    const { items, total } = await workflowService.getAllPaginated(
      environmentUtils.getEnvironmentIds(req.context.environments),
      limit,
      offset,
      listQuery,
    );

    const formattedWorkflows = items.map(
      ({ workflow, status, latestVersionId, latestVersionNumber }) => {
        const environment = req.context.environments.find(
          (env) => env.id === workflow.environment_id,
        );
        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          latestVersion: {
            latestVersionId: latestVersionId,
            status: status,
            latestVersionNumber: latestVersionNumber,
          },
          environment: environment?.type ?? "unknown",
          createdAt: workflow.created_on,
          updatedAt: workflow.modified_on,
        };
      },
    );

    res
      .status(200)
      .json(
        buildPaginatedResponse(
          "workflows",
          formattedWorkflows,
          total,
          page,
          limit,
        ),
      );
  },

  update: async (req: Request, res: Response) => {
    const data = WorkflowGroupUpdateSchema.parse({
      ...req.params,
      ...req.body,
    });
    const updatedWorkflow = await workflowService.update(
      data,
      req.context.actor,
      environmentUtils.getEnvironmentIds(req.context.environments),
    );

    res.status(200).json({
      id: updatedWorkflow.id,
      name: updatedWorkflow.name,
      description: updatedWorkflow.description,
      environment:
        req.context.environments.find(
          (env) => env.id === updatedWorkflow.environment_id,
        )?.type ?? "unknown",
      updatedAt: updatedWorkflow.modified_on,
    });
  },

  get: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse({ ...req.params });
    const { workflow, versions } = await workflowService.get(
      workflowId,
      environmentUtils.getEnvironmentIds(req.context.environments),
    );
    return res.status(200).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      environment:
        req.context.environments.find((env) => env.id === workflow.environment_id)
          ?.type ?? "unknown",
      createdAt: workflow.created_on,
      updatedAt: workflow.modified_on,

      versions: versions.map((version) => {
        return {
          id: version.id,
          description: version.description,
          version: version.version,
          status: version.status,
          publishedAt: version.published_on ?? null,
          createdAt: version.created_on,
          updatedAt: version.modified_on,
        };
      }),
    });
  },

  delete: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse({ ...req.params });
    await workflowService.delete(
      workflowId,
      req.context.actor,
      environmentUtils.getEnvironmentIds(req.context.environments),
    );
    res.status(200).json({});
  },

  changeStatus: (_: Request, res: Response) => {
    res.status(200).json({
      id: "wf-uuid",
      status: "active",
      updatedAt: "2025-01-15T12:00:00.000Z",
    });
  },

  validate: (req: Request, res: Response) => {
    const data = WorkflowDefinitionValidateSchema.parse(req.body);
    const result = workflowValidatorService.validateDefinition(
      data.nodes,
      data.edges,
    );
    res.status(200).json(result);
  },
};
