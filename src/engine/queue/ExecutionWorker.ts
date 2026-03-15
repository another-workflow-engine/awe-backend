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
      console.error(`[Worker] BullMQ job ${job?.id} failed:`, err.message);
    });

    this.worker.on("completed", (job) => {
      console.log(`[Worker] BullMQ job ${job.id} completed`);
    });

    console.log(
      `[Worker] ExecutionWorker started, listening on queue "${EXECUTION_QUEUE_NAME}" (concurrency=10)`,
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }

  private async processJob(job: Job<QueueJob>): Promise<void> {
    const { instanceId, nodeId, context } = job.data;
    console.log(
      `\n[Worker] Job ${job.id} — instanceId=${instanceId} nodeId=${nodeId}`,
    );

    const instance = await instanceRepository.findById(instanceId);
    if (!instance) {
      console.warn(`[Worker] Instance ${instanceId} not found — skipping`);
      return;
    }
    if (instance.status !== InstanceStatuses.IN_PROGRESS) {
      console.warn(
        `[Worker] Instance ${instanceId} status="${instance.status}" (not in_progress) — skipping`,
      );
      return;
    }

    const result = await executionEngine.runNode(instance, nodeId, context);
    console.log(
      `[Worker] runNode outcome="${result.outcome}" instanceId=${instanceId} nodeId=${nodeId}`,
    );

    if (result.outcome === "next") {
      if (instance.auto_advance) {
        console.log(
          `[Worker] Auto-advancing instance=${instanceId} to nodes: [${result.nextNodeIds.join(
            ", ",
          )}]`,
        );
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
          console.log(
            `[Worker] Enqueued nodeId=${nextNodeId} for instanceId=${instanceId}`,
          );
        }
      } else {
        console.log(
          `[Worker] auto_advance=false — pausing instance=${instanceId}`,
        );
        await instanceRepository.updateById(instanceId, {
          status: InstanceStatuses.PAUSED,
        });
      }
    } else if (result.outcome === "user_task") {
      console.log(
        `[Worker] User task created — taskId=${result.taskId} instance=${instanceId} now PAUSED`,
      );
    } else if (result.outcome === "completed") {
      console.log(`[Worker] Instance ${instanceId} COMPLETED`);
    } else if (result.outcome === "failed") {
      console.log(`[Worker] Instance ${instanceId} FAILED`);
    }
  }
}
