import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError.js";
import { authService } from "../services/auth.service.js";
import { apiKeyService } from "../services/apiKey.service.js";
import type { RequestContext } from "../types/auth.js";

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export const authenticateRequest = async (
  req: Request,
  _: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  const apiKeyHeader = req.headers["x-api-key"];
  console.log(apiKeyHeader);

  if (apiKeyHeader && typeof apiKeyHeader === "string") {
    req.context = await apiKeyService.getRequestContextOrThrow(apiKeyHeader);
    return next();
  }

  if (!authHeader) {
    throw new AuthError();
  }

  const [name, value] = authHeader.split(" ");

  if (!name || !value || name !== "Bearer") {
    throw new AuthError("Invalid authorization header");
  }

  req.context = await authService.getRequestContextOrThrow(value);
  return next();
};
