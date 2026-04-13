import { UnrecoverableError, Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { ExecutorResult, QueueJobData } from "../../types/engine.js";
import { getLogger } from "../../logger.js";
import { taskService } from "../../services/task.service.js";
import { engineUtils } from "../../utils/engine.utils.js";
import TaskExecutor from "../executors/TaskExecutor.js";
import type { Logger } from "pino";
import { TaskStatuses } from "../../types/enums.js";
import type { InstanceModel, TaskModel } from "../../types/models.js";
import { EngineError } from "../../errors/EngineError.js";
import { db } from "../../database.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";

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

  private canExecute(instance: InstanceModel, task: TaskModel): boolean {
    try {
      engineUtils.validateInstanceCanExecuteOrThrow(instance);
      engineUtils.validateTaskCanExecuteOrThrow(task);
      return true;
    } catch (err) {
      this.logger.error(
        {
          error: err,
        },
        `Cannot execute task id=${task.id} because instance status=${instance.status} and task status=${task.status}`,
      );
      return false;
    }
  }

  private async initializeExecution(
    jobData: QueueJobData,
  ): Promise<{ executor: TaskExecutor; executionId: string } | undefined> {
    const { instanceId, taskId, nodeId } = jobData;

    return await db.transaction().execute(async (transaction) => {
      const models = await engineUtils.getLockedModels({
        ...jobData,
        transaction,
      });
      if (!models) {
        throw new DataIntegrityError(
          `Unable to lock data for job data=${jobData}`,
        );
      }

      let { instance, task, node } = models;

      if (!this.canExecute(instance, task)) {
        return;
      }

      if (instance.control_signal) {
        const models = await engineUtils.handleInstanceControlSignal({
          instanceId,
          controlSignal: instance.control_signal,
          taskId,
          node,
          transaction,
        });

        if (!models.task) {
          throw new DataIntegrityError(`Task not found for id=${taskId}`);
        }

        ({ instance, task } = models);
        return undefined;
      }

      const executionContext = taskService.getTaskContext(instance, node);
      const executor = new TaskExecutor(task, node, executionContext);
      const executionId = await executor.start(transaction);

      return { executor, executionId };
    });
  }

  private async processJob(job: Job<QueueJobData>): Promise<void> {
    const { instanceId, taskId } = job.data;

    try {
      const data = await this.initializeExecution(job.data);
      if (!data) {
        return;
      }

      this.logger.info(
        { ...job.data },
        `Executing task. Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`,
      );

      const isLastAttempt = job.attemptsMade + 1 === job.opts.attempts;

      const result = await data.executor.run();

      await this.finalizeExecution(job.data, data.executionId, data.executor, result);

      if (result.status === TaskStatuses.COMPLETED || isLastAttempt) {
        return;
      }
    } catch (error) {
      if (job.data?.instanceId && job.data?.taskId) {
        await engineUtils.onExecutionFailure({ error, instanceId: job.data.instanceId, taskId: job.data.taskId });
      }
      throw new UnrecoverableError(
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    if (job.data?.taskId) {
        throw new EngineError(`Task execution for task id=${job.data.taskId} failed`);
    } else {
        throw new EngineError(`Task execution failed`);
    }
  }

  private async finalizeExecution(
    jobData: QueueJobData,
    executionId: string,
    executor: TaskExecutor,
    result: ExecutorResult,
  ) {
    const { instanceId, taskId, nodeId } = jobData;

    return await db.transaction().execute(async (transaction) => {
      const models = await engineUtils.getLockedModels({
        ...jobData,
        transaction,
      });
      if (!models) {
        throw new DataIntegrityError(
          `Unable to lock data for job data=${jobData}`,
        );
      }

      await executor.end(executionId, result, transaction);

      const { instance, task, node } = models;

      await engineUtils.updateInstanceAndRelations({
        instance,
        task,
        node,
        result,
        transaction,
      });
    });
  }
}
