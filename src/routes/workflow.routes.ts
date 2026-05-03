import { Router } from "express";
import { workflowController } from "../controllers/workflow.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { workflowVersionController } from "../controllers/workflowVersion.controller.js";

export const workflowRouter = Router();

workflowRouter.use(authenticateRequest);

workflowRouter.get("/", workflowController.list);

workflowRouter.post("/", workflowController.create);

workflowRouter.get("/:workflowId", workflowController.get);

workflowRouter.patch("/:workflowId", workflowController.update);

workflowRouter.delete("/:workflowId", workflowController.delete);

workflowRouter.post("/validate", workflowController.validate);

// VERSION BASED ROUTES
workflowRouter.get("/:workflowId/versions", workflowVersionController.list);

workflowRouter.get("/versions/:versionId", workflowVersionController.get);

workflowRouter.post("/:workflowId/versions", workflowVersionController.create);

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

workflowRouter.post(
  "/versions/:versionId/clone",
  workflowVersionController.clone,
);

workflowRouter.post(
  "/versions/:versionId/promote",
  workflowVersionController.promote,
);
