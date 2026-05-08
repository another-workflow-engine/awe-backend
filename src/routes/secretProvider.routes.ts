import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { secretProviderController } from "../controllers/secretProvider.controller.js";
import { allowActorTypes } from "../middlewares/requireRoles.middleware.js";
import { ActorTypes } from "../types/enums.js";

export const secretProviderRouter = Router();

secretProviderRouter.use(authenticateRequest);
secretProviderRouter.use(allowActorTypes(ActorTypes.ORGANIZATION_ACCOUNT));

secretProviderRouter.get("/", secretProviderController.list);

secretProviderRouter.post("/", secretProviderController.create);

secretProviderRouter.get(
  "/:providerId/secrets",
  secretProviderController.listSecrets,
);
