import { Router } from "express";
import { instanceController } from "../controllers/instance.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const instanceRouter = Router();

instanceRouter.use(authenticateRequest);

instanceRouter.get("/", instanceController.list);

instanceRouter.get("/:instanceId", instanceController.get);

instanceRouter.get(
  "/:instanceId/execution-sequence",
  instanceController.getExecutionSequence,
);

instanceRouter.post("/", instanceController.create);

instanceRouter.post("/:instanceId/resume", instanceController.resume);

instanceRouter.post("/:instanceId/pause", instanceController.pause);

instanceRouter.post("/:instanceId/terminate", instanceController.terminate);
