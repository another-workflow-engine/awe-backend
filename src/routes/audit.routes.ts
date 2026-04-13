import { Router } from "express";
import { auditController } from "../controllers/audit.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const auditRouter = Router();

auditRouter.use(authenticateRequest, resolveEnvironmentContext);

auditRouter.get(
  "/:instanceId",
  auditController.getInstanceAudit,
);
