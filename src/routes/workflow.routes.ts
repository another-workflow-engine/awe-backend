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
  workflowVersionController.create,
);

workflowRouter.get(
  "/:workflowId/versions/:version",
  authenticateRequest,
  workflowVersionController.get,
);

workflowRouter.post(
  "/:workflowId/versions/:version/validate",
  authenticateRequest,
  workflowVersionController.validate,
);

workflowRouter.patch(
  "/:workflowId/versions/:version/status",
  authenticateRequest,
  workflowVersionController.updateStatus,
);

workflowRouter.get(
  "/:workflowId/latest",
  workflowVersionController.getLatest
);
