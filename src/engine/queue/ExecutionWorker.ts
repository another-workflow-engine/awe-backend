import { Worker, type Job } from "bullmq";
import type { ConnectionOptions, Queue } from "bullmq";
import { executionEngine } from "../ExecutionEngine.js";
import { TaskStatuses } from "../../types/enums.js";
import Config from "../../config.js";
import type { QueueJobData } from "../../types/engine.js";
import { taskService } from "../../services/task.service.js";
import { db } from "../../database.js";

export class ExecutionWorker {
  private readonly worker: Worker<QueueJobData>;

  constructor(
    private readonly queue: Queue<QueueJobData>,
    connection: ConnectionOptions,
  ) {
    this.worker = new Worker<QueueJobData>(
      Config.EXECUTION_QUEUE_NAME,
      (job: Job<QueueJobData>) => this.processJob(job),
      { connection, concurrency: 10 },
    );

    this.worker.on("failed", (job, err) => {
      console.error(`[Worker] BullMQ job ${job?.id} failed:`, err.message);
    });

    this.worker.on("completed", (job) => {
      console.log(`[Worker] BullMQ job ${job.id} completed`);
    });

    console.log(
      `[Worker] ExecutionWorker started, listening on queue "${Config.EXECUTION_QUEUE_NAME}" (concurrency=10)`,
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }

  private async processJob(job: Job<QueueJobData>): Promise<void> {
    const { taskId } = job.data;
    const { instance, node, task } =
      await taskService.getAllTaskDetails(taskId);

    const result = await executionEngine.runNode(instance, node, task);

    if (result.nextNodeIds.length === 0) return;

    await db.transaction().execute(async (transaction) => {
      for (const nodeId of result.nextNodeIds) {
        const newTask = await taskService.createNew(
          instance.id,
          nodeId,
          TaskStatuses.IN_PROGRESS,
          transaction,
        );

        await this.queue.add(
          "execute-node",
          { taskId: newTask.id },
          {
            jobId: newTask.id,
            attempts: 1,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 5000 },
          },
        );
      }
    });
  }
}
