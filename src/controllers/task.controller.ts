import type { Request, Response } from "express";
import { taskService } from "../services/task.service.js";
import { resumeUserTask } from "../services/userTask.service.js";
import { TaskParamsSchema, TaskCompleteSchema } from "../schemas/task.schema.js";
import { NotFoundError } from "../errors/NotFoundError.js";

export const taskController = {
  list: async (req: Request, res: Response) => {
    const tasks = await taskService.listPending(req.actor.id);
    return res.json({ tasks });
  },

  getTask: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);
    const task = await taskService.getTask(taskId, req.actor.id);
    if (!task) throw new NotFoundError("Task");
    return res.json({ task });
  },

  completeUserTask: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);
    const { userInput } = TaskCompleteSchema.parse(req.body);
    await resumeUserTask(taskId, userInput, req.actor.id);
    return res.json({});
  },
};
