process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.FRONTEND_URL = "http://localhost:3000";

process.env.JWT_ACCESS_SECRET = "test-secret";
process.env.JWT_REFRESH_SECRET = "test-secret";

process.env.JWT_ACCESS_EXPIRES_MINS = "15";
process.env.JWT_REFRESH_EXPIRES_DAYS = "7";

process.env.API_KEY_PREFIX = "awe_test";

process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.REDIS_PASSWORD = "test-password";
process.env.EXECUTION_QUEUE_NAME = "execution-queue-test";

jest.mock("../src/services/queue.service.js", () => ({
	queueService: {
		enqueue: jest.fn(async () => undefined),
		initializeWorker: jest.fn(() => undefined),
		close: jest.fn(async () => undefined),
	},
}));