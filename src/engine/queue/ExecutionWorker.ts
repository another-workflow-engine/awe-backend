import { UnrecoverableError, Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { QueueJobData } from "../../types/engine.js";
import { getLogger } from "../../logger.js";
import { engineUtils } from "../../utils/engine.utils.js";
import type { Logger } from "pino";
import { taskExecutionService } from "../../services/taskExecution.service.js";
import { executorMap } from "../executors/executorMap.js";
import { EngineError } from "../../errors/EngineError.js";
import { NodeTypes, TaskStatuses } from "../../types/enums.js";
import { taskService } from "../../services/task.service.js";
import { instanceService } from "../../services/instance.service.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { nodeService } from "../../services/node.services.js";
import { openTransaction } from "../../utils/database.utils.js";

export class ExecutionWorker {
  private readonly worker: Worker<QueueJobData>;
  private logger: Logger;

  constructor(connection: ConnectionOptions) {
    this.worker = new Worker<QueueJobData>(
      Config.EXECUTION_QUEUE_NAME,
      (job: Job<QueueJobData>) => this.processJob(job),
      { connection, concurrency: 10 },
    );

    this.logger = getLogger();

    this.worker.on("failed", (job, err) => {
      this.logger.error(err, `[Worker] BullMQ job ${job?.id} failed.`);
    });

    this.worker.on("completed", (job) => {
      this.logger.info(`[Worker] BullMQ job ${job.id} completed`);
    });

    this.logger.info(
      `[Worker] ExecutionWorker started, listening on queue "${Config.EXECUTION_QUEUE_NAME}" (concurrency=10)`,
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }

  private async processJob(job: Job<QueueJobData>): Promise<void> {
    await this.execute(job.data)
      .then((res) => {
        if (!res.success) {
          throw new Error(
            `Task execution for task id=${job.data.taskId} failed`,
          );
        }
      })
      .catch(async (error) => {
        this.logger.error(error, "Encountered an unrecoverable error");
        const { instanceId, taskId } = job.data;

        await engineUtils.onTaskFailure({
          instanceId,
          taskId,
          message: error.message,
          error,
        });

        throw new UnrecoverableError(
          error instanceof Error ? error.message : "Unknown error",
        );
      });
  }

  private async getExecutor(jobData: QueueJobData) {
    return await openTransaction(async (transaction) => {
      const [{ instance, task, taskExecution }, node] = await Promise.all([
        instanceService.getLockedInProgressOrPausedRelations(
          jobData.instanceId,
          transaction,
        ),
        nodeService.getByIdOrThrow(jobData.nodeId),
      ]);

      if (!instance || !task) {
        throw new DataIntegrityError(
          `Unable to lock data for job data=${jobData}`,
        );
      }

      if (taskExecution) {
        throw new DataIntegrityError(
          `Task execution id=${taskExecution.id} for job data=${jobData} exists`,
        );
      }

      engineUtils.validateInstanceCanExecuteOrThrow(instance);
      engineUtils.validateTaskCanExecuteOrThrow(task);

      const taskContext = taskService.getTaskContext(instance, node);

      if (node.type === NodeTypes.USER) {
        throw new EngineError(
          `User task cannot be executed by engine - Task id=${task.id}`,
        );
      }

      const newTaskExecution = await taskExecutionService.create(
        task.instance_id,
        task.id,
        taskContext,
        transaction,
      );

      const ExecutorClass = executorMap[node.type];
      return new ExecutorClass(node, taskContext, newTaskExecution.id);
    });
  }

  private async execute(jobData: QueueJobData) {
    const executor = await this.getExecutor(jobData);
    const result = await executor.run();

    await engineUtils.completeTask({
      jobData,
      executionResult: result,
    });

    return {
      success: result.status === TaskStatuses.COMPLETED,
    };
  }
}
