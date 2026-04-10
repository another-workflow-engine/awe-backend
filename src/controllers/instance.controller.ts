import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import {
  InstanceCreateSchema,
  InstanceParamsSchema,
} from "../schemas/instance.schema.js";
import { taskExecutionService } from "../services/taskExecution.service.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";
import { instanceSignalService } from "../services/instanceSignal.service.js";

export const instanceController = {
  list: async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePaginationFromRequest(req);

    const { items, total } = await instanceService.listPaginated(
      req.actor.id,
      req.environmentIds,
      limit,
      offset,
    );

    return res.json(
      buildPaginatedResponse("instances", items, total, page, limit),
    );
  },

  create: async (req: Request, res: Response) => {
    const data = InstanceCreateSchema.parse({ ...req.body });
    const { instance, workflowVersion } = await instanceService.createNew(
      data,
      req.actor,
      req.environmentIds,
    );
    return res.status(201).json({
      id: instance.id,
      inputVariables: instance.input_variables,
      status: instance.status,
      startedAt: instance.started_on,
      autoAdvance: instance.auto_advance,
      workflow: {
        id: workflowVersion.workflow_id,
        version: workflowVersion.version,
      },
    });
  },

  get: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const { instance, workflow_name, workflowVersion, node, task } =
      await instanceService.get(instanceId, req.actor.id, req.environmentIds);
    return res.json({
      id: instance.id,
      inputVariables: instance.input_variables,
      currentVariables: instance.current_variables,
      outputVariables: instance.output_variables,
      status: instance.status,
      startedAt: instance.started_on,
      endedAt: instance.ended_on,
      autoAdvance: instance.auto_advance,
      workflow: {
        name: workflow_name,
        id: workflowVersion.workflow_id,
        version: workflowVersion.version,
      },
      currentTask:
        !task || !node
          ? null
          : {
              id: task.id,
              nodeId: node.client_id,
              type: node.type,
              name: node.name,
              status: task.status,
              startedAt: task.created_on,
            },
    });
  },

  resume: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceService.resume(
      instanceId,
      req.actor,
      req.environmentIds,
    );
    return res.json({ instance });
  },

  getExecutionLogs: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);

    await instanceService.get(
      instanceId,
      req.actor.id,
      req.environmentIds,
    );

    const executionLogs =
      await taskExecutionService.getExecutionLogs(instanceId);
    return res.json(executionLogs);
  },

  pause: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceService.signalPause(
      instanceId,
      req.actor,
      req.environmentIds,
    );
    return res.json({ instance });
  },

  terminate: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceSignalService.signalTerminate(
      instanceId,
      req.actor,
      req.environmentIds,
    );
    return res.json({ instance });
  },
};
