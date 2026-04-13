import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { QueueJobData } from "../../types/engine.js";
import { getLogger } from "../../logger.js";

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
      attempts: maxAttempts,
      backoff: {
        type: backoffType,
        delay: backoffDelay,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 5000 },
    });
  }

  async removeJob(jobId: string): Promise<void> {
    const logger = getLogger();
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.debug({ jobId }, "Job removed from queue");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("locked")) {
        logger.info(
          { jobId, error: err.message },
          "Job is currently being processed by worker, will complete naturally",
        );
        return;
      }
      throw err;
    }
  }

  async getJob(jobId: string) {
    return await this.queue.getJob(jobId);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
