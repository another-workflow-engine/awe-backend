import type { NextFunction, Request, Response } from "express";
import type { ActorType } from "../types/database.js";
import { AuthError } from "../errors/AuthError.js";

export const allowActorTypes =
  (...allowedActors: ActorType[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const isAuthorized = allowedActors.includes(req.context.actor.type);

    if (!isAuthorized) {
      throw new AuthError("Forbidden", 403);
    }

    next();
  };
