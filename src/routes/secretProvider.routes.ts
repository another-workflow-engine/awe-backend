import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { secretProviderController } from "../controllers/secretProvider.controller.js";

export const secretProviderRouter = Router();

secretProviderRouter.use(authenticateRequest);

secretProviderRouter.get("/", secretProviderController.list);
secretProviderRouter.post("/", secretProviderController.create);
