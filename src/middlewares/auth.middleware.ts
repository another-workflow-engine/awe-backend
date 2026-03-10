import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError.js";
import type { ActorModel } from "../types/models.js";
import { authService } from "../services/auth.service.js";
import { apiKeyService } from "../services/apiKey.service.js";

declare global {
  namespace Express {
    interface Request {
      actor: ActorModel;
    }
  }
}

export const authenticateRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log(authHeader)
    throw new AuthError();
  }

  const [name, value] = authHeader.split(" ");

  if (!name || !value) {
    throw new AuthError();
  }

  if (name === "Bearer") {
    req.actor = authService.getActorOrThrow(value);
    return next();
  }

  if (name === "ApiKey") {
    req.actor = await apiKeyService.getActorOrThrow(value);
    return next();
  }

  throw new AuthError();
};
