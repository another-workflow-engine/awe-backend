import { UnrecoverableError, Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { QueueJobData } from "../../types/engine.js";
import { getLogger } from "../../logger.js";
import { taskService } from "../../services/task.service.js";
import { engineUtils } from "../../utils/engine.utils.js";
import { instanceService } from "../../services/instance.service.js";
import { nodeService } from "../../services/node.services.js";
import TaskExecutor from "../executors/TaskExecutor.js";
import type { Logger } from "pino";
import { TaskStatuses } from "../../types/enums.js";
import type {
  InstanceModel,
  TaskModel,
} from "../../types/models.js";
import { EngineError } from "../../errors/EngineError.js";

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

  private async processJob(job: Job<QueueJobData>): Promise<void> {
    const { instanceId, taskId, nodeId } = job.data;

    let [instance, task, node] = await Promise.all([
      instanceService.getByIdOrThrow(instanceId),
      taskService.getByIdOrThrow(taskId),
      nodeService.getByIdOrThrow(nodeId),
    ]);

    const updatedModels = await engineUtils.handleInstanceControlSignal(
      instance,
      task,
      node,
    );

    instance = updatedModels.instance;
    task = updatedModels.task;

    if (this.canExecute(instance, task) === false) {
      return;
    }

    this.logger.info(
      node.configuration,
      `Executing task id=${task.id} type=${node.type}. Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`,
    );

    try {
      const executionContext = taskService.getTaskContext(instance, node);

      const executor = new TaskExecutor(task, node);
      const { executionId, result } = await executor.run(executionContext);
      await executor.end(executionId, result);

      const isLastAttempt = job.attemptsMade + 1 === job.opts.attempts;

      if (result.status === TaskStatuses.COMPLETED || isLastAttempt) {
        await engineUtils.updateInstanceAndTask(instance, node, task, result);
        return;
      }
    } catch (err) {
      await engineUtils.onExecutionFailure(err, task);

      throw new UnrecoverableError(
        err instanceof Error ? err.message : "Unknown error",
      );
    }

    throw new EngineError(`Task execution for task id=${task.id} failed`);
  }
}
