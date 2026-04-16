import type { Request, Response } from "express";
import { userTaskService } from "../services/userTaskExecution.service.js";
import { UserTaskParamsSchema } from "../schemas/task.schema.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";

export const userTaskController = {
  list: async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePaginationFromRequest(req);
    const { items, total } = await userTaskService.getPendingPaginated(
      req.actor,
      req.environmentIds,
      limit,
      offset,
    );

    return res.json(buildPaginatedResponse("tasks", items, total, page, limit));
  },

  getTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const task = await userTaskService.get(taskId, req.actor, req.environmentIds);
    return res.json({ ...task });
  },

  completeUserTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const userInput = req.body ?? {};
    delete userInput.environment;
    const { taskExecution } =
      await userTaskService.completeUserTask(
        taskId,
        userInput,
        req.actor,
        req.environmentIds,
      );
    return res.json({
      status: taskExecution.status,
      completedAt: taskExecution.ended_on,
    });
  },
};
