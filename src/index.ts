import app from "./app.js";
import Config from "./config.js";
import { checkDb } from "./database.js";
import { getLogger } from "./logger.js";
import { queueService } from "./services/queue.service.js";

app.listen(Config.SERVER_PORT, async () => {
  const logger = getLogger();

  try {
    await checkDb();
    logger.info("Database connection established");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database. Exiting.");
    process.exit(1);
  }

  logger.info(`server is running on port ${Config.SERVER_PORT}`);
  queueService.startWorker();
  // await queueService.obliterate();
});
