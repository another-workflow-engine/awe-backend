import { Router } from "express";
import { workflowGroupController } from "../controllers/workflowGroup.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";

export const workflowRouter = Router();

// WORKFLOWS
workflowRouter.get("/", authenticateRequest, workflowGroupController.list);

workflowRouter.post("/", authenticateRequest, workflowGroupController.create);

// CREATE VERSION
workflowRouter.post(
  "/:workflowId/versions",
  authenticateRequest,
  workflowVersionController.create,
);

// VERSION BASED ROUTES (NOW USING versionId)
workflowRouter.post(
  "/versions/:versionId/validate",
  authenticateRequest,
  workflowVersionController.validate,
);

workflowRouter.post(
  "/versions/:versionId/publish",
  authenticateRequest,
  workflowVersionController.publish,
);

workflowRouter.post(
  "/versions/:versionId/activate",
  authenticateRequest,
  workflowVersionController.activate,
);

workflowRouter.post(
  "/versions/:versionId/deactivate",
  authenticateRequest,
  workflowVersionController.publish,
);

workflowRouter.patch(
  "/versions/:versionId",
  authenticateRequest,
  workflowVersionController.update,
);
