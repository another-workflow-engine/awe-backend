import { Router } from "express";
import { authenticateRequest } from "../middlewares/auth.middleware.js";
import { secretController } from "../controllers/secret.controller.js";

export const secretRouter = Router();

secretRouter.use(authenticateRequest);

secretRouter.post("/", secretController.create);
