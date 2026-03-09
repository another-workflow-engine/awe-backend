import { Router } from "express";
import { workflowGroupController } from "../controllers/workflowGroup.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";

export const workflowRouter = Router();

workflowRouter.post("/", authenticateRequest, workflowGroupController.create);

workflowRouter.get("/", authenticateRequest, workflowGroupController.list);

workflowRouter.post("/validate", workflowGroupController.validate);

workflowRouter.get(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.get,
);

workflowRouter.patch(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.update,
);

workflowRouter.delete(
  "/:workflowId",
  authenticateRequest,
  workflowGroupController.delete,
);

workflowRouter.patch(
  "/:workflowId/status",
  workflowGroupController.changeStatus,
);

workflowRouter.post(
  "/:workflowId/versions",
  authenticateRequest,
  workflowVersionController.createVersion,
);

workflowRouter.get(
  "/:workflowId/versions/:version",
  authenticateRequest,
  workflowVersionController.get,
);

workflowRouter.post(
  "/:workflowId/versions/:versionNumber/validate",
  workflowVersionController.validateVersion,
);

workflowRouter.post(
  "/:workflowId/versions/:versionNumber/publish",
  workflowVersionController.publishVersion,
);
