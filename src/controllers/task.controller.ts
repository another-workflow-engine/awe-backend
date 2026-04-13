import type { Request, Response } from "express";
import { instanceService } from "../services/instance.service.js";
import { taskService } from "../services/task.service.js";
import { z } from "zod";

const TaskParamsSchema = z.object({
  taskId: z.string().uuid(),
});

export const taskController = {
  retryTask: async (req: Request, res: Response) => {
    const { taskId } = TaskParamsSchema.parse(req.params);

    const task = await taskService.getByIdOrThrow(taskId);
    const instanceId = task.instance_id;

    const instance = await instanceService.retry(
      instanceId,
      req.actor,
      req.environmentIds,
      taskId,
    );

    return res.json({ instance });
  },
};
