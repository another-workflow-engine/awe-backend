import express from "express";
import cors from "cors";
import { router } from "./routes/index.js";
import Config from "./config.js";
import { responseFormatter } from "./middlewares/responseFormatter.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { requestLoggerMiddleware } from "./middlewares/requestLogger.middleware.js";
import { pinoHttp } from "pino-http";
import { baseLogger } from "./logger.js";

const app = express();

app.use(cors({ origin: Config.FRONTEND_URL, credentials: true }));

app.use(express.json());

app.use(responseFormatter);

app.use(
  pinoHttp({
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
  }),
);

app.use(requestLoggerMiddleware);

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.use(router);

app.use(errorHandler);

export default app;
