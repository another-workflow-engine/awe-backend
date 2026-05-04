import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { allowActorTypes } from "../middlewares/requireRoles.middleware.js";
import { ActorTypes } from "../types/enums.js";

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

organizationRouter.get(
  "/me",
  authenticateRequest,
  allowActorTypes(ActorTypes.ORGANIZATION_ACCOUNT),
  organizationController.me,
);
