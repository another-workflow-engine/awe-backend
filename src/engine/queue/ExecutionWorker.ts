import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import Config from "../../config.js";
import type { ExecutorResult, QueueJobData } from "../../types/engine.js";
import { getLogger } from "../../logger.js";
import { taskService } from "../../services/task.service.js";
import { engineUtils } from "../../utils/engine.utils.js";
import { instanceService } from "../../services/instance.service.js";
import { nodeService } from "../../services/node.services.js";
import TaskExecutor from "../executors/TaskExecutor.js";
import type { Logger } from "pino";
import { NodeTypes, TaskStatuses } from "../../types/enums.js";
import { NodeSchema } from "../../schemas/node.schema.js";
import { converterUtils } from "../../utils/converter.utils.js";

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
    const { instanceId, taskId, nodeId } = job.data;
    const [instance, task, node] = await Promise.all([
      instanceService.getById(instanceId),
      taskService.getById(taskId),
      nodeService.getByIdOrThrow(nodeId),
    ]);

    let result: ExecutorResult = {
      status: TaskStatuses.FAILED,
      outputVariables: {},
      nextNodeId: null,
    };
    let executionThrew = false;
    let isLastAttempt = true;

    try {
      let maxAttempts = 1;
      const nodeSchema = converterUtils.parseOrThrow(NodeSchema, node);
      if (
        nodeSchema.type === NodeTypes.SCRIPT ||
        nodeSchema.type === NodeTypes.SERVICE
      ) {
        maxAttempts = nodeSchema.configuration.maxAttempts;
      }

      isLastAttempt = job.attemptsMade >= maxAttempts - 1;

      engineUtils.validateInstanceCanExecuteOrThrow(instance);
      const executionContext = taskService.getTaskContext(instance, node);

      const executor = new TaskExecutor(task, node);
      this.logger.info(node.configuration, `Executing ${node.type} node`);

      result = await executor.run(executionContext);
    } catch (err) {
      if (isLastAttempt) {
        await engineUtils.onExecutionFailure(err, task);
        return;
      }

      this.logger.warn(
        { error: err },
        `[Worker] Job ${job.id} failed on attempt ${job.attemptsMade + 1}/${node.max_attempts}`,
      );

      executionThrew = true;
    }

    await engineUtils.updateInstanceAndTask(
      instance,
      node,
      task,
      result,
      isLastAttempt,
    );

    if (result.status !== TaskStatuses.COMPLETED || executionThrew === true) {
      throw new Error();
    }
  }
}
