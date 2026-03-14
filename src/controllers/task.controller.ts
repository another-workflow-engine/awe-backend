import type { Request, Response } from "express";
import { resumeUserTask } from "../services/userTask.service.js";

export async function resumeTask(req: Request, res: Response) {
  try {
    const { taskId, input } = req.body;
    const context = req.body.context;

    const result = await resumeUserTask(taskId, input, context);

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
