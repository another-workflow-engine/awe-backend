import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { apiKeyController } from "../controllers/apiKey.controller.js";

export const apiKeyRouter = Router();

apiKeyRouter.use(authenticateRequest);

apiKeyRouter.get("/", apiKeyController.list);
apiKeyRouter.post("/", apiKeyController.generate);
apiKeyRouter.patch("/:keyId/revoke", apiKeyController.revoke);
