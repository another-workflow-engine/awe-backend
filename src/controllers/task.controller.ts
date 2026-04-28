import type { Request, Response } from "express";
import { taskService } from "../services/task.service.js";
import { TaskParamsSchema, TaskRetrySchema } from "../schemas/task.schema.js";

export const taskController = {
  get: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);

    const detail = await taskService.getDetail(
      taskId,
      req.context.environments,
    );

    return res.status(200).json(detail);
  },

  retry: async (req: Request, res: Response) => {
    const data = TaskRetrySchema.parse({ ...req.params, ...req.body });

    const task = await taskService.retry(
      data,
      req.context.actor,
      req.context.environments,
    );

    return res.status(200).json(task);
  },
};
