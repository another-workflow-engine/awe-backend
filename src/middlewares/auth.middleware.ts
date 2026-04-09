import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/AuthError.js";
import type { ActorModel } from "../types/models.js";
import { authService } from "../services/auth.service.js";
import { apiKeyService } from "../services/apiKey.service.js";
import { baseLogger } from "../logger.js";

declare global {
  namespace Express {
    interface Request {
      actor: ActorModel;
    }
  }
}

function logApiKeyError(
  req: Request,
  errorType: "missing" | "invalid" | "expired",
): void {
  baseLogger.warn(
    {
      endpoint: req.method + " " + req.url,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      errorType,
      userAgent: req.headers["user-agent"],
    },
    `API Key ${errorType} - request blocked`,
  );
}

export const authenticateRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  const apiKeyHeader = req.headers["x-api-key"];

  if (!authHeader && !apiKeyHeader) {
    logApiKeyError(req, "missing");
    throw new AuthError();
  }

  if (typeof apiKeyHeader === "string" && apiKeyHeader) {
    try {
      req.actor = await apiKeyService.getActorOrThrow(apiKeyHeader);
      return next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const errorType = errorMessage.toLowerCase().includes("revoked")
        ? "expired"
        : "invalid";
      logApiKeyError(req, errorType);
      throw new AuthError();
    }
  }

  if (authHeader) {
    const [name, value] = authHeader.split(" ");

    if (!name || !value) {
      logApiKeyError(req, "invalid");
      throw new AuthError();
    }

    if (name === "Bearer") {
      req.actor = authService.getActorOrThrow(value);
      return next();
    }

    if (name === "ApiKey") {
      try {
        req.actor = await apiKeyService.getActorOrThrow(value);
        return next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";
        const errorType = errorMessage.toLowerCase().includes("revoked")
          ? "expired"
          : "invalid";
        logApiKeyError(req, errorType);
        throw new AuthError();
      }
    }
  }

  logApiKeyError(req, "invalid");
  throw new AuthError();
};
