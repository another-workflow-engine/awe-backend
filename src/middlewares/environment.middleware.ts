import type { NextFunction, Request, Response } from "express";
import { environmentService } from "../services/environment.services.js";
import { ValidationError } from "../errors/ValidationError.js";
import type { EnvironmentType } from "../types/database.js";
import { parseEnvironmentTypesFromQuery } from "../utils/environment.utils.js";
import { ActorTypes } from "../types/enums.js";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      environmentId: string;
      environmentIds: string[];
      environmentType: EnvironmentType;
      environmentTypes: EnvironmentType[];
    }
  }
}

export const resolveEnvironmentContext = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  let environments;

  if (req.actor.type === ActorTypes.API_KEY_CLIENT) {
    const environment = await environmentService.getByActor(req.actor);
    environments = [environment];
  } else if (req.method === "GET") {
    const environmentTypes = parseEnvironmentTypesFromQuery(
      req.query.environmentType,
    );

    if (environmentTypes.length > 0) {
      environments = await environmentService.getByActorAndTypes(
        req.actor,
        environmentTypes,
      );

      if (environments.length === 0) {
        throw new ValidationError("Invalid environmentType for this actor", [
          {
            field: "environmentType",
            message: `Environment ${environmentTypes.join(", ")} is not available for this actor`,
          },
        ]);
      }
    } else {
      environments = await environmentService.getAllByActor(req.actor);
    }
  } else if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const rawEnvironmentType = (req.body as { environmentType?: unknown })
      .environmentType;

    if (!rawEnvironmentType) {
      throw new ValidationError("environmentType is required in request body", [
        {
          field: "environmentType",
          message:
            "Provide a single environmentType (development, staging, or production) in the body",
        },
      ]);
    }

    const EnvironmentTypeSchema = z.enum([
      "development",
      "staging",
      "production",
    ] as [EnvironmentType, ...EnvironmentType[]]);

    const environmentType = EnvironmentTypeSchema.parse(
      String(rawEnvironmentType).trim(),
    );

    const environment = await environmentService.getByActorAndType(
      req.actor,
      environmentType,
    );
    environments = [environment];
  } else {
    environments = await environmentService.getAllByActor(req.actor);
  }

  if (!environments || environments.length === 0) {
    throw new ValidationError("No environments available for this actor", [
      {
        field: "environmentType",
        message: "At least one environment is required",
      },
    ]);
  }

  req.environmentIds = environments.map((environment) => environment.id);
  req.environmentTypes = environments.map((environment) => environment.type);

  const primaryEnvironmentId = req.environmentIds[0];
  const primaryEnvironmentType = req.environmentTypes[0];

  if (!primaryEnvironmentId || !primaryEnvironmentType) {
    throw new ValidationError("No environments available for this actor", [
      {
        field: "environmentType",
        message: "At least one environment is required",
      },
    ]);
  }

  req.environmentId = primaryEnvironmentId;
  req.environmentType = primaryEnvironmentType;
  return next();
};
