import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { apiKeyController } from "../controllers/apiKey.controller.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const organizationRouter = Router();

organizationRouter.post("/register", organizationController.register);

organizationRouter.get("/api-keys", authenticateRequest, apiKeyController.list);
organizationRouter.post(
  "/api-keys",
  authenticateRequest,
  apiKeyController.generate,
);
organizationRouter.patch(
  "/api-keys/:keyId/revoke",
  authenticateRequest,
  apiKeyController.revoke,
);

organizationRouter.get(
  "/dashboard",
  authenticateRequest,
  resolveEnvironmentContext,
  organizationController.dashboard,
);

organizationRouter.get("/me", authenticateRequest, organizationController.me);
