import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import {
  InstanceCreateSchema,
  InstanceParamsSchema,
} from "../schemas/instance.schema.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";

export const instanceController = {
  list: async (req: Request, res: Response) => {
    const instances = await instanceService.listAll(req.actor.id);
    return res.json({ instances });
  },

  create: async (req: Request, res: Response) => {
    const data = InstanceCreateSchema.parse({ ...req.body });
    const { instance, workflowVersion } = await instanceService.createNew(
      data,
      req.actor,
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
    const { instance, workflowVersion, node, task } = await instanceService.get(
      instanceId,
      req.actor.id,
    );
    return res.json({
      instance: {
        id: instance.id,
        workflow_version_id: instance.workflow_version_id,
        status: instance.status,
        auto_advance: instance.auto_advance,
        input_variables: instance.input_variables,
        current_variables: instance.current_variables,
        output_variables: instance.output_variables,
        started_on: instance.started_on,
        ended_on: instance.ended_on,
        created_by: instance.created_by,
        created_on: instance.created_on,
        version_number: workflowVersion.version,
        current_task:
          !task || !node
            ? null
            : {
                id: task.id,
                node_id: node.client_id,
                type: node.type,
                name: node.name,
                status: task.status,
                started_at: task.created_on,
              },
      },
    });
  },

  advance: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);
    await instanceService.advanceInstance(instanceId, req.actor);

    const { instance, workflowVersion, node, task } = await instanceService.get(
      instanceId,
      req.actor.id,
    );

    return res.json({
      instance: {
        id: instance.id,
        workflow_version_id: instance.workflow_version_id,
        status: instance.status,
        auto_advance: instance.auto_advance,
        input_variables: instance.input_variables,
        current_variables: instance.current_variables,
        output_variables: instance.output_variables,
        started_on: instance.started_on,
        ended_on: instance.ended_on,
        created_by: instance.created_by,
        created_on: instance.created_on,
        version_number: workflowVersion.version,
        current_task:
          !task || !node
            ? null
            : {
                id: task.id,
                node_id: node.client_id,
                type: node.type,
                name: node.name,
                status: task.status,
                started_at: task.created_on,
              },
      },
    });
  },

  getExecutionLogs: async (req: Request, res: Response) => {
    const { instanceId } = InstanceParamsSchema.parse(req.params);

    const instance = await instanceService.get(instanceId, req.actor.id);
    if (!instance)
      throw new NotFoundError(`Instance id=${instanceId} not found`);

    const executions =
      await taskExecutionRepository.findByInstanceId(instanceId);
    return res.json({ executions });
  },
};
