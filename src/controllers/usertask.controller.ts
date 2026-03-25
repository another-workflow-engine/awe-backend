import type { Request, Response } from "express";
import { userTaskService } from "../services/userTask.service.js";
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
      limit,
      offset,
    );

    return res.json(buildPaginatedResponse("tasks", items, total, page, limit));
  },

  getTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const task = await userTaskService.get(taskId, req.actor);
    return res.json({ ...task });
  },

  completeUserTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const execution = await userTaskService.completeUserTask(
      taskId,
      req.body ?? {},
      req.actor,
    );
    return res.json({
      status: execution.status,
      completedAt: execution.ended_on,
    });
  },
};
