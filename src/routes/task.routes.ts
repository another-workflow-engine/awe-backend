import { Router } from "express";
import { userTaskController } from "../controllers/usertask.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const taskRouter = Router();

taskRouter.use(authenticateRequest, resolveEnvironmentContext);

taskRouter.get("/", userTaskController.list);
taskRouter.get("/:taskId", userTaskController.getTask);
taskRouter.post(
  "/:taskId/complete",
  userTaskController.completeUserTask,
);
