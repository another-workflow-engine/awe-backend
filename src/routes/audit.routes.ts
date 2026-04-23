import { Router } from "express";
import { auditController } from "../controllers/audit.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const auditRouter = Router();

auditRouter.use(authenticateRequest);

auditRouter.get("/:instanceId", auditController.getInstanceAudit);
