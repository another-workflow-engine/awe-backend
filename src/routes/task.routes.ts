import { Router } from "express";
import { taskController } from "../controllers/task.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const taskRouter = Router();

taskRouter.use(authenticateRequest);

taskRouter.get("/:taskId", taskController.get);

taskRouter.post("/:taskId/retry", taskController.retry);
