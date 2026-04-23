import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const organizationRouter = Router();

organizationRouter.post(
  "/organizations/register",
  organizationController.register,
);

organizationRouter.get(
  "/dashboard",
  authenticateRequest,
  organizationController.dashboard,
);

organizationRouter.get("/me", authenticateRequest, organizationController.me);
