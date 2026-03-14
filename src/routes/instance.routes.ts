import { Router } from "express";
import { instanceController } from "../controllers/instance.controller.js";
import { authenticateRequest } from "../middlewares/auth.middleware.js";

export const instanceRouter = Router();

instanceRouter.post("/", authenticateRequest, instanceController.create);
