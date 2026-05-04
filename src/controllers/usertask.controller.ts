import type { Request, Response } from "express";
import { userTaskService } from "../services/userTaskExecution.service.js";
import {
  PendingUserTaskListRequestSchema,
  TaskIdSchema,
} from "../schemas/task.schema.js";

export const userTaskController = {
  list: async (req: Request, res: Response) => {
    const data = PendingUserTaskListRequestSchema.parse(req.query);

    const result = await userTaskService.getPendingPaginated(
      data,
      req.context.environments,
    );

    return res.status(200).json(result);
  },

  get: async (req: Request, res: Response) => {
    const { taskId } = TaskIdSchema.parse(req.params);
    const detail = await userTaskService.get(taskId, req.context.environments);
    return res.status(200).json(detail);
  },

  complete: async (req: Request, res: Response) => {
    const { taskId } = TaskIdSchema.parse(req.params);
    const userInput = req.body ?? {};

    const detail = await userTaskService.completeUserTask(
      taskId,
      userInput,
      req.context.environments,
    );
    return res.status(200).json(detail);
  },
};
