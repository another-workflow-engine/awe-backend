import { Router } from "express";
import { instanceController } from "../controllers/instance.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const instanceRouter = Router();

instanceRouter.get("/", authenticateRequest, instanceController.list);
instanceRouter.post("/", authenticateRequest, instanceController.create);
instanceRouter.get("/:instanceId", authenticateRequest, instanceController.getById);
instanceRouter.post("/:instanceId/resume", authenticateRequest, instanceController.resumeInstance);
