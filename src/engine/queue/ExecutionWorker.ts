import { Worker, type Job } from "bullmq";
import type { ConnectionOptions, Queue } from "bullmq";
import type { QueueJob } from "./types.js";
import { instanceRepository } from "../../repositories/instance.repository.js";
import { executionEngine } from "../ExecutionEngine.js";
import { InstanceStatuses } from "../../types/enums.js";
import { EXECUTION_QUEUE_NAME } from "./BullMQQueue.js";

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
} as const;

export class ExecutionWorker {
  private readonly worker: Worker<QueueJob>;

  constructor(
    private readonly queue: Queue<QueueJob>,
    connection: ConnectionOptions,
  ) {
    this.worker = new Worker<QueueJob>(
      EXECUTION_QUEUE_NAME,
      (job: Job<QueueJob>) => this.processJob(job),
      { connection, concurrency: 10 },
    );

    this.worker.on("failed", (job, err) => {
      console.error(`BullMQ job ${job?.id} failed:`, err);
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
  }

  private async processJob(job: Job<QueueJob>): Promise<void> {
    const { instanceId, nodeId, context } = job.data;

    const instance = await instanceRepository.findById(instanceId);
    if (!instance || instance.status !== InstanceStatuses.IN_PROGRESS) return;

    const result = await executionEngine.runNode(instance, nodeId, context);

    if (result.outcome === "next") {
      if (instance.auto_advance) {
        for (const nextNodeId of result.nextNodeIds) {
          await this.queue.add(
            "execute-node",
            {
              instanceId,
              nodeId: nextNodeId,
              context: result.context,
            },
            {
              jobId: `${instanceId}-${nextNodeId}`,
              ...JOB_OPTIONS,
            },
          );
        }
      } else {
        await instanceRepository.updateById(instanceId, {
          status: InstanceStatuses.PAUSED,
        });
      }
    }
  }
}
