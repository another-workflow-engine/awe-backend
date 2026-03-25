import app from "./app.js";
import { queueService } from "./services/queue.service.js";

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, async () => {
  console.log(`server is running on port ${PORT}`);
  queueService.startWorker();
  // await queueService.obliterate();
});
