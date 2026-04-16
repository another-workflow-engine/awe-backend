import { Router } from "express";
import { userTaskController } from "../controllers/usertask.controller.js";
import { taskController } from "../controllers/task.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import {
  resolveEnvironmentContext,
  resolveEnvironmentContextFromActor,
} from "../middlewares/environment.middleware.js";

export const taskRouter = Router();

taskRouter.use(authenticateRequest);

taskRouter.get("/", resolveEnvironmentContext, userTaskController.list);
taskRouter.get("/:taskId", resolveEnvironmentContextFromActor, userTaskController.getTask);
taskRouter.post(
  "/:taskId/complete",
  resolveEnvironmentContextFromActor,
  userTaskController.completeUserTask,
);
taskRouter.post(
  "/:taskId/retry",
  resolveEnvironmentContextFromActor,
  taskController.retryTask,
);
