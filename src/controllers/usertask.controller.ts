import type { Request, Response } from "express";
import { userTaskService } from "../services/userTaskExecution.service.js";
import { TaskParamsSchema } from "../schemas/task.schema.js";
import {
  buildPaginatedResponse,
  parsePaginationFromRequest,
} from "../utils/pagination.utils.js";

export const userTaskController = {
  list: async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePaginationFromRequest(req);
    const assignee = req.query.assignee as string | undefined;
    const { items, total } = await userTaskService.getPendingPaginated(
      req.context.actor,
      assignee,
      req.context.environments,
      limit,
      offset,
    );

    return res.json(buildPaginatedResponse("tasks", items, total, page, limit));
  },

  getTask: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);
    const task = await userTaskService.get(
      taskId,
      req.context.actor,
      req.context.environments,
    );
    return res.json({ ...task });
  },

  completeUserTask: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);
    const userInput = req.body ?? {};
    delete userInput.environment;
    const { taskExecution } = await userTaskService.completeUserTask(
      taskId,
      userInput,
      req.context.actor,
      req.context.environments,
    );
    return res.json({
      status: taskExecution.status,
      completedAt: taskExecution.ended_on,
    });
  },
};
