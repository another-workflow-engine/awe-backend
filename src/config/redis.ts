import type { ConnectionOptions } from "bullmq";
import Config from "../config.js";

export const redisConnectionOptions: ConnectionOptions = {
  host: Config.REDIS_HOST ?? "localhost",
  port: parseInt(Config.REDIS_PORT ?? "6379", 10),
  password: Config.REDIS_PASSWORD,
};
