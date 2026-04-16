import { Router } from "express";
import { instanceController } from "../controllers/instance.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import {
  resolveEnvironmentContext,
  resolveEnvironmentContextFromActor,
} from "../middlewares/environment.middleware.js";

export const instanceRouter = Router();

instanceRouter.use(authenticateRequest);

instanceRouter.get("/", resolveEnvironmentContext, instanceController.list);
instanceRouter.post("/", resolveEnvironmentContextFromActor, instanceController.create);
instanceRouter.get("/:instanceId", resolveEnvironmentContextFromActor, instanceController.get);
instanceRouter.get(
  "/:instanceId/execution-sequence",
  resolveEnvironmentContextFromActor,
  instanceController.getExecutionSequence,
);
instanceRouter.get(
  "/:instanceId/tasks/:taskId",
  resolveEnvironmentContextFromActor,
  instanceController.getTaskDetail,
);
instanceRouter.get(
  "/:instanceId/constants",
  resolveEnvironmentContextFromActor,
  instanceController.getRetryConstants,
);
instanceRouter.post(
  "/:instanceId/resume",
  resolveEnvironmentContextFromActor,
  instanceController.resume,
);
instanceRouter.post(
  "/:instanceId/pause",
  resolveEnvironmentContextFromActor,
  instanceController.pause,
);
instanceRouter.post(
  "/:instanceId/terminate",
  resolveEnvironmentContextFromActor,
  instanceController.terminate,
);

instanceRouter.post(
  "/:instanceId/retry",
  resolveEnvironmentContextFromActor,
  instanceController.retryInstance,
);
