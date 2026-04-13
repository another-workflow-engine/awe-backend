import { Router } from "express";
import { instanceController } from "../controllers/instance.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const instanceRouter = Router();

instanceRouter.use(authenticateRequest, resolveEnvironmentContext);

instanceRouter.get("/", instanceController.list);
instanceRouter.post("/", instanceController.create);
instanceRouter.get("/:instanceId", instanceController.get);
instanceRouter.get(
  "/:instanceId/executions",
  instanceController.getExecutionLogs,
);
instanceRouter.post(
  "/:instanceId/resume",
  instanceController.resume,
);
instanceRouter.post(
  "/:instanceId/pause",
  instanceController.pause,
);
instanceRouter.post(
  "/:instanceId/terminate",
  instanceController.terminate,
);

instanceRouter.post(
  "/:instanceId/retry",
  instanceController.retryInstance,
);
