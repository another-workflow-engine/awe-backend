import { Router } from "express";
import { userTaskController } from "../controllers/userTask.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { environmentUtils } from "../utils/environment.utils.js";

export const userTaskRouter = Router();

userTaskRouter.use(authenticateRequest);

userTaskRouter.get("/", async (req, res) => {
  const selectedTypes = environmentUtils.parseEnvironmentsFromQueryString(
    req.query.environment,
  );
  if (selectedTypes.length > 0) {
    req.context.environments = req.context.environments.filter((env) =>
      selectedTypes.includes(env.type),
    );
  }
  return userTaskController.list(req, res);
});

userTaskRouter.get("/:taskId", userTaskController.getTask);

userTaskRouter.post("/:taskId/complete", userTaskController.completeUserTask);
