import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { ValidationError } from "../errors/ValidationError.js";
import { ZodError } from "zod";
import { getLogger } from "../logger.js";

export const errorHandler = (
  err: Error,
  _: Request,
  res: Response,
  __: NextFunction,
) => {
  const logger = getLogger();

  if (err instanceof SyntaxError && "body" in err) {
    logger.debug(err, err.message);

    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
      details: err.message,
    });
  }

  if (err instanceof ValidationError) {
    logger.debug(err, err.message);

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.fieldErrors,
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode === 500) {
      logger.error(err, err.message);
    } else {
      logger.debug(err, err.message);
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  if (err instanceof ZodError) {
    const errorDetails = err.issues.map((issue) => {
      return { field: issue.path.join("."), message: issue.message };
    });

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: errorDetails,
    });
  }

  logger.error(err, err.message);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
