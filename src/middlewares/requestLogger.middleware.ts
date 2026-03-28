import { loggerStorage } from "../logger.js";
import type { Request, Response, NextFunction } from "express";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  loggerStorage.run(req.log, next);
}
