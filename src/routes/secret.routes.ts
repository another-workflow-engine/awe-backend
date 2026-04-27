import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { secretController } from "../controllers/secret.controller.js";

import { environmentUtils } from "../utils/environment.utils.js";

export const secretRouter = Router();

secretRouter.use(authenticateRequest);

secretRouter.post("/", secretController.create);

secretRouter.get("/", async (req, res) => {
  const selectedTypes = environmentUtils.parseEnvironmentsFromQueryString(
    req.query.environment,
  );
  if (selectedTypes.length > 0) {
    req.context.environments = req.context.environments.filter((env) =>
      selectedTypes.includes(env.type),
    );
  }
  return secretController.list(req, res);
});

secretRouter.get("/by-provider/:providerId", async (req, res) => {
  const selectedTypes = environmentUtils.parseEnvironmentsFromQueryString(
    req.query.environment,
  );
  if (selectedTypes.length > 0) {
    req.context.environments = req.context.environments.filter((env) =>
      selectedTypes.includes(env.type),
    );
  }
  return secretController.listByProvider(req, res);
});
secretRouter.delete("/:secretId", secretController.delete);
secretRouter.get("/:providerId", secretController.listAllSecrets);