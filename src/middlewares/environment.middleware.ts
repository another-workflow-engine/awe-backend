import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { environmentService } from "../services/environment.services.js";
import { ValidationError } from "../errors/ValidationError.js";
import { EnvironmentTypes } from "../types/enums.js";
import type { EnvironmentType } from "../types/database.js";

declare global {
  namespace Express {
    interface Request {
      environmentId: string;
      environmentType: EnvironmentType;
    }
  }
}

const EnvironmentTypeSchema = z.enum([
  EnvironmentTypes.DEVELOPMENT,
  EnvironmentTypes.STAGING,
  EnvironmentTypes.PRODUCTION,
]);

export const resolveEnvironmentContext = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const parsed = EnvironmentTypeSchema.safeParse(req.query.environmentType);

  if (!parsed.success) {
    throw new ValidationError("Invalid or missing environmentType query parameter", [
      {
        field: "environmentType",
        message: `Must be one of: ${EnvironmentTypes.DEVELOPMENT}, ${EnvironmentTypes.STAGING}, ${EnvironmentTypes.PRODUCTION}`,
      },
    ]);
  }

  const environmentType = parsed.data;
  const environment = await environmentService.getByActorAndType(
    req.actor,
    environmentType,
  );

  req.environmentId = environment.id;
  req.environmentType = environmentType;
  return next();
};
