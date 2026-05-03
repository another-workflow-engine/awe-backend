import type { Request, Response } from "express";
import { workflowService } from "../services/workflow.service.js";
import {
  WorkflowDefinitionValidateSchema,
  WorkflowCreateRequestSchema,
  WorkflowUpdateRequestSchema,
  WorkflowIdSchema,
  WorkflowListRequestSchema,
} from "../schemas/workflow.schema.js";
import { workflowValidatorService } from "../services/workflowValidator.service.js";

export const workflowController = {
  list: async (req: Request, res: Response) => {
    const data = WorkflowListRequestSchema.parse({
      ...req.query,
      ...req.params,
    });

    const result = await workflowService.listPaginated(
      data,
      req.context.environments,
    );

    res.status(200).json(result);
  },

  create: async (req: Request, res: Response) => {
    const data = WorkflowCreateRequestSchema.parse(req.body);

    const workflow = await workflowService.create(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(201).json(workflow);
  },

  get: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse(req.params);

    const workflowDetail = await workflowService.get(
      workflowId,
      req.context.environments,
    );

    return res.status(200).json(workflowDetail);
  },

  update: async (req: Request, res: Response) => {
    const data = WorkflowUpdateRequestSchema.parse({
      ...req.params,
      ...req.body,
    });

    const updatedWorkflowDetail = await workflowService.update(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json(updatedWorkflowDetail);
  },

  delete: async (req: Request, res: Response) => {
    const { workflowId } = WorkflowIdSchema.parse(req.params);
    await workflowService.delete(
      workflowId,
      req.context.actor,
      req.context.environments,
    );
    return res.status(204).end();
  },

  validate: (req: Request, res: Response) => {
    const data = WorkflowDefinitionValidateSchema.parse(req.body);
    const result = workflowValidatorService.validateDefinition(
      data.nodes,
      data.edges,
    );
    return res.status(200).json(result);
  },
};
