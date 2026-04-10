import { Router } from "express";
import { workflowGroupController } from "../controllers/workflowGroup.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";
import { resolveEnvironmentContext } from "../middlewares/environment.middleware.js";

export const workflowRouter = Router();

workflowRouter.use(authenticateRequest, resolveEnvironmentContext);

// WORKFLOWS
workflowRouter.get("/", workflowGroupController.list);

workflowRouter.post("/", workflowGroupController.create);

// CREATE VERSION
workflowRouter.post(
  "/:workflowId/versions",
  workflowVersionController.create,
);
workflowRouter.patch(
  "/:workflowId",
  workflowGroupController.update,
);

// VERSION BASED ROUTES
workflowRouter.post(
  "/versions/:versionId/validate",
  workflowVersionController.validate,
);

workflowRouter.post(
  "/versions/:versionId/publish",
  workflowVersionController.publish,
);

workflowRouter.post(
  "/versions/:versionId/activate",
  workflowVersionController.activate,
);

workflowRouter.post(
  "/versions/:versionId/deactivate",
  workflowVersionController.publish,
);

workflowRouter.patch(
  "/versions/:versionId",
  workflowVersionController.update,
);

// GET version detail
workflowRouter.get(
  "/versions/:versionId",
  workflowVersionController.get,
);

// LIST versions for a workflow
workflowRouter.get(
  "/:workflowId/versions",
  workflowVersionController.list,
);

// GET single workflow
workflowRouter.get(
  "/:workflowId",
  workflowGroupController.get,
);

workflowRouter.delete(
  "/:workflowId",
  workflowGroupController.delete,
);

workflowRouter.post(
  "/versions/:versionId/clone",
  workflowVersionController.clone,
);

workflowRouter.post(
  "/versions/:versionId/promote",
  authenticateRequest,
  resolveEnvironmentContext,
  workflowVersionController.promote,
);