import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { apiKeyController } from "../controllers/apiKey.controller.js";
import { allowActorTypes } from "../middlewares/requireRoles.middleware.js";
import { ActorTypes } from "../types/enums.js";

export const apiKeyRouter = Router();

apiKeyRouter.use(authenticateRequest);
apiKeyRouter.use(allowActorTypes(ActorTypes.ORGANIZATION_ACCOUNT));

apiKeyRouter.get("/", apiKeyController.list);
apiKeyRouter.post("/", apiKeyController.generate);
apiKeyRouter.patch("/:keyId/revoke", apiKeyController.revoke);
