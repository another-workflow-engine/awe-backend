import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../errors/ValidationError.js";
import type { EnvironmentType } from "../types/database.js";
import { parseEnvironmentsFromQuery } from "../utils/environment.utils.js";
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
    throw new ValidationError("No environments available for this actor 2", [
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

export const resolveEnvironmentContextFromActor = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const environments = req.context.environments.map((env) => {
    return { id: env.id, type: env.type };
  });
  assignEnvironmentContext(req, environments);
  return next();
};

export const resolveEnvironmentContext = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  let environments = req.context.environments.map((env) => {
    return { id: env.id, type: env.type };
  });

  if (req.method === "GET") {
    const requestEnvironments = parseEnvironmentsFromQuery(
      req.query.environment,
    );

    if (requestEnvironments.length > 0 && environments.length === 0) {
      throw new ValidationError("Invalid environment for this actor", [
        {
          field: "environment",
          message: `Environment ${requestEnvironments.join(", ")} is not available for this actor`,
        },
      ]);
    }

    if (requestEnvironments.length > 0) {
      environments = environments.filter((e) =>
        requestEnvironments.includes(e.type),
      );
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

    environments = environments.filter((e) => e.type === environmentType);
  }

  assignEnvironmentContext(req, environments);
  return next();
};
