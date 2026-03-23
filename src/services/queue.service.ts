import { BullMQQueue } from "../engine/queue/BullMQQueue.js";
import { ExecutionWorker } from "../engine/queue/ExecutionWorker.js";
import { redisConnectionOptions } from "../config/redis.js";
import type { QueueJobData } from "../types/engine.js";

const bullMQQueue = new BullMQQueue(redisConnectionOptions);
let workerInstance: ExecutionWorker | null = null;

export const queueService = {
  enqueue: async (job: QueueJobData): Promise<void> => {
    await bullMQQueue.enqueue(job);
  },

  startWorker: (): void => {
    workerInstance = new ExecutionWorker(
      bullMQQueue.queue,
      redisConnectionOptions,
    );
  },

  obliterate: async (): Promise<void> => {
    await bullMQQueue.queue.obliterate({ force: true });
  },

  stopWorker: async (): Promise<void> => {
    await workerInstance?.close();
    workerInstance = null;
    await bullMQQueue.close();
  },
};
