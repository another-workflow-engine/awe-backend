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
workflowRouter.patch(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.update,
);

// VERSION BASED ROUTES
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

// GET version detail
workflowRouter.get(
  "/versions/:versionId",
  authenticateRequest,
  workflowVersionController.get,
);

// LIST versions for a workflow
workflowRouter.get(
  "/:workflowId/versions",
  authenticateRequest,
  workflowVersionController.list,
);

// GET single workflow
workflowRouter.get(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.get,
);

workflowRouter.delete(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.delete,
);

workflowRouter.post(
  "/versions/:versionId/clone",
  authenticateRequest,
  workflowVersionController.clone,
);
