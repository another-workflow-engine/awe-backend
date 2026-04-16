import type { NextFunction, Request, Response } from "express";
import { environmentService } from "../services/environment.services.js";
import { ValidationError } from "../errors/ValidationError.js";
import type { EnvironmentType } from "../types/database.js";
import { parseEnvironmentsFromQuery } from "../utils/environment.utils.js";
import { ActorTypes } from "../types/enums.js";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      environmentId: string;
      environmentIds: string[];
      environment: EnvironmentType;
      environments: EnvironmentType[];
    }
  }
}

const assignEnvironmentContext = (
  req: Request,
  environments: Array<{ id: string; type: EnvironmentType }>,
) => {
  if (!environments || environments.length === 0) {
    throw new ValidationError("No environments available for this actor", [
      {
        field: "environment",
        message: "At least one environment is required",
      },
    ]);
  }

  req.environmentIds = environments.map((environment) => environment.id);
  req.environments = environments.map((environment) => environment.type);

  const primaryEnvironmentId = req.environmentIds[0];
  const primaryEnvironmentType = req.environments[0];

  if (!primaryEnvironmentId || !primaryEnvironmentType) {
    throw new ValidationError("No environments available for this actor", [
      {
        field: "environment",
        message: "At least one environment is required",
      },
    ]);
  }

  req.environmentId = primaryEnvironmentId;
  req.environment = primaryEnvironmentType;
};

const getEnvironmentsForActor = async (req: Request) => {
  if (req.actor.type === ActorTypes.API_KEY_CLIENT) {
    const environment = await environmentService.getByActor(req.actor);
    return [environment];
  }

  return await environmentService.getAllByActor(req.actor);
};

export const resolveEnvironmentContextFromActor = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const environments = await getEnvironmentsForActor(req);
  assignEnvironmentContext(req, environments);
  return next();
};

export const resolveEnvironmentContext = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  let environments;

  if (req.actor.type === ActorTypes.API_KEY_CLIENT) {
    environments = await getEnvironmentsForActor(req);
  } else if (req.method === "GET") {
    const requestEnvironments = parseEnvironmentsFromQuery(req.query.environment);

    if (requestEnvironments.length > 0) {
      environments = await environmentService.getByActorAndEnvironments(
        req.actor,
        requestEnvironments,
      );

      if (environments.length === 0) {
        throw new ValidationError("Invalid environment for this actor", [
          {
            field: "environment",
            message: `Environment ${requestEnvironments.join(", ")} is not available for this actor`,
          },
        ]);
      }
    } else {
      environments = await environmentService.getAllByActor(req.actor);
    }
  } else if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const rawEnvironment = (req.body as { environment?: unknown }).environment;

    if (!rawEnvironment) {
      throw new ValidationError("environment is required in request body", [
        {
          field: "environment",
          message:
            "Provide a single environment (development, staging, or production) in the body",
        },
      ]);
    }

    const EnvironmentTypeSchema = z.enum([
      "development",
      "staging",
      "production",
    ] as [EnvironmentType, ...EnvironmentType[]]);

    const environmentType = EnvironmentTypeSchema.parse(
      String(rawEnvironment).trim(),
    );

    const environment = await environmentService.getByActorAndEnvironment(
      req.actor,
      environmentType,
    );
    environments = [environment];
  } else {
    environments = await getEnvironmentsForActor(req);
  }

  assignEnvironmentContext(req, environments);
  return next();
};
