process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.FRONTEND_URL = "http://localhost:3000";

process.env.JWT_ACCESS_SECRET = "test-secret";
process.env.JWT_REFRESH_SECRET = "test-secret";

process.env.JWT_ACCESS_EXPIRES_MINS = "15";
process.env.JWT_REFRESH_EXPIRES_DAYS = "7";

process.env.API_KEY_PREFIX = "awe_test";