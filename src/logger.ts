import pino, { type Logger } from "pino";
import Config from "./config";
import { AsyncLocalStorage } from "async_hooks";

export const baseLogger = pino({
  level: Config.PINO_LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      singleLine: true,
    },
  },
});

export const loggerStorage = new AsyncLocalStorage<Logger>();

export function getLogger(): Logger {
  return loggerStorage.getStore() ?? baseLogger;
}
