import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { ZodError } from "zod";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  if (err instanceof ZodError) {
    // console.log(...err.issues)
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.issues,
    });
  }

  

  return res.status(500).json({
    success: false,
    error: "Internal server error",
  });
};
