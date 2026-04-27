import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { environmentUtils } from "../utils/environment.utils.js";

export const organizationRouter = Router();

organizationRouter.post(
  "/organizations/register",
  organizationController.register,
);

organizationRouter.get(
  "/dashboard",
  authenticateRequest,
  async (req, res) => {
    const selectedTypes = environmentUtils.parseEnvironmentsFromQueryString(
      req.query.environment,
    );
    if (selectedTypes.length > 0) {
      req.context.environments = req.context.environments.filter((env) =>
        selectedTypes.includes(env.type),
      );
    }
    return organizationController.dashboard(req, res);
  },
);

organizationRouter.get("/me", authenticateRequest, organizationController.me);
