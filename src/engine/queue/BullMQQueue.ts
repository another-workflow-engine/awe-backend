import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { QueueJobData } from "../../types/engine.js";

export class BullMQQueue {
  readonly queue: Queue<QueueJobData>;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue<QueueJobData>(Config.EXECUTION_QUEUE_NAME, {
      connection,
    });
  }

  async enqueue(
    jobData: QueueJobData,
    maxAttempts: number,
    backoffType: string,
    backoffDelay: number,
  ): Promise<void> {
    await this.queue.add("execute-node", jobData, {
      jobId: jobData.taskId,
      attempts: maxAttempts,
      backoff: {
        type: backoffType,
        delay: backoffDelay,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 5000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
