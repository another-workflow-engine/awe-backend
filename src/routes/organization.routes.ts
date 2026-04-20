import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const organizationRouter = Router();

organizationRouter.post(
  "/organizations/register",
  organizationController.register,
);

organizationRouter.get(
  "/dashboard",
  authenticateRequest,
  resolveEnvironmentContext,
  organizationController.dashboard,
);

organizationRouter.get("/me", authenticateRequest, organizationController.me);
