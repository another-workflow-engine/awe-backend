import { Router } from "express";
import { workflowGroupController } from "../controllers/workflowGroup.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";
import {
  resolveEnvironmentContext,
  resolveEnvironmentContextFromActor,
} from "../middlewares/environment.middleware.js";

export const workflowRouter = Router();

workflowRouter.use(authenticateRequest);

// WORKFLOWS
workflowRouter.get("/", resolveEnvironmentContext, workflowGroupController.list);

workflowRouter.post("/", resolveEnvironmentContext, workflowGroupController.create);

// CREATE VERSION
workflowRouter.post(
  "/:workflowId/versions",
  resolveEnvironmentContextFromActor,
  workflowVersionController.create,
);
workflowRouter.patch(
  "/:workflowId",
  resolveEnvironmentContextFromActor,
  workflowGroupController.update,
);

// VERSION BASED ROUTES
workflowRouter.post(
  "/versions/:versionId/validate",
  resolveEnvironmentContextFromActor,
  workflowVersionController.validate,
);

workflowRouter.post(
  "/versions/:versionId/publish",
  resolveEnvironmentContextFromActor,
  workflowVersionController.publish,
);

workflowRouter.post(
  "/versions/:versionId/activate",
  resolveEnvironmentContextFromActor,
  workflowVersionController.activate,
);

workflowRouter.post(
  "/versions/:versionId/deactivate",
  resolveEnvironmentContextFromActor,
  workflowVersionController.publish,
);

workflowRouter.patch(
  "/versions/:versionId",
  resolveEnvironmentContextFromActor,
  workflowVersionController.update,
);

// GET version detail
workflowRouter.get(
  "/versions/:versionId",
  resolveEnvironmentContextFromActor,
  workflowVersionController.get,
);

// LIST versions for a workflow
workflowRouter.get(
  "/:workflowId/versions",
  resolveEnvironmentContextFromActor,
  workflowVersionController.list,
);

// GET single workflow
workflowRouter.get(
  "/:workflowId",
  resolveEnvironmentContextFromActor,
  workflowGroupController.get,
);

workflowRouter.delete(
  "/:workflowId",
  resolveEnvironmentContextFromActor,
  workflowGroupController.delete,
);

workflowRouter.post(
  "/versions/:versionId/clone",
  resolveEnvironmentContextFromActor,
  workflowVersionController.clone,
);

workflowRouter.post(
  "/versions/:versionId/promote",
  resolveEnvironmentContextFromActor,
  workflowVersionController.promote,
);