import { Router } from "express";
import { workflowGroupController } from "../controllers/workflowGroup.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";

export const workflowRouter = Router();

workflowRouter.use(authenticateRequest);

// WORKFLOWS
workflowRouter.get("/", workflowGroupController.list);

workflowRouter.post("/", workflowGroupController.create);

workflowRouter.post("/:workflowId/versions", workflowVersionController.create);

workflowRouter.post("/validate", workflowGroupController.validate);

workflowRouter.patch("/:workflowId", workflowGroupController.update);

// VERSION BASED ROUTES
workflowRouter.patch("/versions/:versionId", workflowVersionController.update);

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

// GET version detail
workflowRouter.get("/versions/:versionId", workflowVersionController.get);

// LIST versions for a workflow
workflowRouter.get("/:workflowId/versions", workflowVersionController.list);

// GET single workflow
workflowRouter.get("/:workflowId", workflowGroupController.get);

workflowRouter.delete("/:workflowId", workflowGroupController.delete);

workflowRouter.post(
  "/versions/:versionId/clone",
  workflowVersionController.clone,
);

workflowRouter.post(
  "/versions/:versionId/promote",
  workflowVersionController.promote,
);
