import { Router } from "express";
import { systemRouter } from "./system.routes.js";
import { authRouter } from "./auth.routes.js";
import { workflowRouter } from "./workflow.routes.js";
import { instanceRouter } from "./instance.routes.js";
import { taskRouter } from "./task.routes.js";
import { auditRouter } from "./audit.routes.js";
import { secretRouter } from "./secret.routes.js";
export const router = Router();

const apiRouter = Router();
apiRouter.use("/systems", systemRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/workflows", workflowRouter);
apiRouter.use("/instances", instanceRouter);
apiRouter.use("/tasks", taskRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/secrets", secretRouter);

router.use("/api/v1", apiRouter);
