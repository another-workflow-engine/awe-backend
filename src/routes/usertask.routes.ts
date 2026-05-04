import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { userTaskController } from "../controllers/usertask.controller.js";

export const userTaskRouter = Router();

userTaskRouter.use(authenticateRequest);

userTaskRouter.get("/", userTaskController.list);

userTaskRouter.get("/:taskId", userTaskController.get);

userTaskRouter.post("/:taskId/complete", userTaskController.complete);
