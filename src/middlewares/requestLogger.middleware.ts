import { pinoHttp } from "pino-http";
import { baseLogger, loggerStorage } from "../logger.js";
import type { Request, Response, NextFunction } from "express";

export const requestLogFormatter = pinoHttp({
  logger: baseLogger,
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  loggerStorage.run(req.log, next);
}
