import { AppError } from "./errors/AppError.js";

const Config = {
  SERVER_PORT: process.env.SERVER_PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_MINS: process.env.JWT_ACCESS_EXPIRES_MINS,
  JWT_REFRESH_EXPIRES_DAYS: process.env.JWT_REFRESH_EXPIRES_DAYS,
  API_KEY_PREFIX: process.env.API_KEY_PREFIX,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  EXECUTION_QUEUE_NAME: process.env.EXECUTION_QUEUE_NAME,
  PINO_LOG_LEVEL: process.env.PINO_LOG_LEVEL,
};

function validateConfig(config: Record<string, string | undefined>) {
  const missing = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new AppError(`Missing environment variables: ${missing.join(", ")}`);
  }
}

validateConfig(Config);

type ConfigType = Record<keyof typeof Config, string>;
export default Config as ConfigType;
