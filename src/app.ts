import express from "express";
import cors from "cors";
import { router } from "./routes/index.js";
import Config from "./config.js";
import { responseFormatter } from "./middlewares/responseFormatter.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { NotFoundError } from "./errors/NotFoundError.js";
import { requestLogFormatter, requestLoggerMiddleware } from "./middlewares/requestLogger.middleware.js";

const app = express();

app.use(cors({ origin: Config.FRONTEND_URL, credentials: true }));

app.use(express.json());

app.use(responseFormatter);

app.use(requestLogFormatter);
app.use(requestLoggerMiddleware);

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.use(router);

app.use((_req, _res, next) => {
  next(new NotFoundError("Route"));
});

app.use(errorHandler);

export default app;
