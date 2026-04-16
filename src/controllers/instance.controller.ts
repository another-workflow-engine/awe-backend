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
import { z } from "zod";

const RetryInstanceBodySchema = z.object({
  constants: z.record(z.string(), z.unknown()).default({}),
});

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
      environment: req.environment,
      workflow: {
        id: workflowVersion.workflow_id,
        version: workflowVersion.version,
      },
    });
  },

  get: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const {
      instance,
      workflow_name,
      workflowVersion,
      node,
      task,
      latestTaskExecution,
      latestUserTaskExecution,
    } = await instanceService.get(instanceId, req.actor.id, req.environmentIds);

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
              latestTaskExecution: latestTaskExecution?.id ?? null,
              latestUserTaskExecution: latestUserTaskExecution?.id ?? null,
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

  getExecutionSequence: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    await instanceService.assertAccessible(instanceId, req.environmentIds);
    const sequence =
      await taskExecutionService.getExecutionSequence(instanceId);
    return res.json({ success: true, data: sequence });
  },

  getTaskDetail: async (req: Request, res: Response) => {
    const { instanceId, taskId } = req.params as {
      instanceId: string;
      taskId: string;
    };

    await instanceService.assertAccessible(instanceId, req.environmentIds);
    const detail = await taskExecutionService.getTaskDetail(instanceId, taskId);
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
        code: "TASK_NOT_FOUND",
      });
    }
    return res.json({ success: true, data: detail });
  },

  pause: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const instance = await instanceSignalService.signalPause(
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

  retryInstance: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const { constants } = RetryInstanceBodySchema.parse(req.body ?? {});
    const instance = await instanceService.retry(
      instanceId,
      req.actor,
      req.environmentIds,
      undefined,
      constants,
    );
    return res.json({ instance });
  },

  getRetryConstants: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    const constants = await instanceService.getRetryConstants(
      instanceId,
      req.actor,
      req.environmentIds,
    );

    return res.json({ constants });
  },
};
