import { Router } from "express";
import { taskController } from "../controllers/task.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const taskRouter = Router();

taskRouter.get("/", authenticateRequest, taskController.list);
taskRouter.get("/:taskId", authenticateRequest, taskController.getTask);
taskRouter.post("/:taskId/complete", authenticateRequest, taskController.completeUserTask);
