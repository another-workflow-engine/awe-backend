import { Worker, type Job } from "bullmq";
import type { ConnectionOptions, Queue } from "bullmq";
import Config from "../../config.js";
import type {
  ContextVariables,
  ExecutorResult,
  QueueJobData,
} from "../../types/engine.js";
import { getLogger } from "../../logger.js";
import { taskService } from "../../services/task.service.js";
import {
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../../types/enums.js";
import { EngineError } from "../../errors/EngineError.js";
import { engineUtils } from "../../utils/engine.utils.js";
import { instanceService } from "../../services/instance.service.js";
import { nodeService } from "../../services/node.services.js";
import TaskExecutor from "../executors/TaskExecutor.js";
import { db } from "../../database.js";
import type { DB, InstanceStatus, NodeType } from "../../types/database.js";
import type { InstanceModel, NodeModel } from "../../types/models.js";
import { converterUtils } from "../../utils/converter.utils.js";
import type { Transaction } from "kysely";
import type { Logger } from "pino";

export class ExecutionWorker {
  private readonly worker: Worker<QueueJobData>;
  private logger: Logger;

  constructor(
    private readonly queue: Queue<QueueJobData>,
    connection: ConnectionOptions,
  ) {
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

  private async handleNextNode(
    instance: InstanceModel,
    currentNodeType: NodeType,
    nextNodeId: string | null,
  ) {
    if (currentNodeType === NodeTypes.END) {
      return;
    }

    if (nextNodeId === null) {
      throw new EngineError(`Next node is null`);
    }

    const nextNode = await nodeService.getById(nextNodeId);
    if (!nextNode) {
      throw new EngineError(`Node not found node id = ${nextNodeId}`);
    }

    if (nextNode && instance.auto_advance) {
      await taskService.create(nextNode, instance);
    }
  }

  private getUpdatedInstanceContext(
    node: NodeModel,
    executionOuputVariables: Record<string, unknown>,
    instance: InstanceModel,
  ): ContextVariables {
    if (node.type === NodeTypes.START) {
      return converterUtils.objectToContextVariables(executionOuputVariables);
    }

    const instanceContext = converterUtils.jsonValueToContextVariables(
      instance.current_variables,
    );

    return {
      constants: {
        ...instanceContext.constants,
        ...executionOuputVariables,
      },
      fetchables: { ...instanceContext.fetchables },
      urls: { ...instanceContext.urls },
    };
  }

  private getUpdatedInstanceStatus(
    isAutoAdvance: boolean,
    result: ExecutorResult,
    nodeType: NodeType,
  ) {
    let instanceStatus: InstanceStatus;

    if (
      result.status === TaskStatuses.IN_PROGRESS &&
      nodeType === NodeTypes.USER
    ) {
      instanceStatus = InstanceStatuses.PAUSED;
    } else if (result.status === TaskStatuses.TERMINATED) {
      instanceStatus = InstanceStatuses.TERMINATED;
    } else if (nodeType === NodeTypes.END) {
      instanceStatus = InstanceStatuses.COMPLETED;
    } else if (
      result.nextNodeId === null ||
      result.status === TaskStatuses.FAILED
    ) {
      instanceStatus = InstanceStatuses.FAILED;
    } else {
      instanceStatus = isAutoAdvance
        ? InstanceStatuses.IN_PROGRESS
        : InstanceStatuses.PAUSED;
    }

    return instanceStatus;
  }

  private async applyInstanceUpdate(
    instance: InstanceModel,
    node: NodeModel,
    result: ExecutorResult,
    instanceStatus: InstanceStatus,
    instanceContext: ContextVariables,
    transaction: Transaction<DB>,
  ): Promise<InstanceModel> {
    if (
      node.type === NodeTypes.END &&
      result.status === TaskStatuses.COMPLETED
    ) {
      return await instanceService.complete(
        instance.id,
        result.outputVariables,
        transaction,
      );
    }

    if (
      instanceStatus === InstanceStatuses.FAILED ||
      result.nextNodeId === null
    ) {
      return await instanceService.fail(
        instance.id,
        {
          message:
            result.nextNodeId === null ? "Next node not found" : "Tasks failed",
        },
        transaction,
      );
    }

    return await instanceService.updateContext(
      instance.id,
      instanceStatus,
      instanceContext,
      result.nextNodeId,
      transaction,
    );
  }

  private async processJob(job: Job<QueueJobData>): Promise<void> {
    const { instanceId, taskId, nodeId } = job.data;
    const [instance, task, node] = await Promise.all([
      instanceService.getById(instanceId),
      taskService.getById(taskId),
      nodeService.getByIdOrThrow(nodeId),
    ]);

    engineUtils.validateInstanceCanExecuteOrThrow(instance);

    const executionContext = taskService.getTaskContext(instance, node);

    try {
      const executor = new TaskExecutor(task, node);
      this.logger.info(node.configuration, `Executing ${node.type} node`);

      const result = await executor.run(executionContext);

      const instanceStatus = this.getUpdatedInstanceStatus(
        instance.auto_advance,
        result,
        node.type,
      );

      const instanceContext = this.getUpdatedInstanceContext(
        node,
        result.outputVariables,
        instance,
      );

      await db.transaction().execute(async (transaction) => {
        const [, updatedInstance] = await Promise.all([
          taskService.complete(task, transaction),
          this.applyInstanceUpdate(
            instance,
            node,
            result,
            instanceStatus,
            instanceContext,
            transaction,
          ),
        ]);

        await this.handleNextNode(
          updatedInstance,
          node.type,
          result.nextNodeId,
        );
        return updatedInstance;
      });
    } catch (err) {
      let message = "Unknown error";
      let error = undefined;

      if (err instanceof Error) {
        message = err.message;
        error = err;
      }

      await db.transaction().execute(async (transaction) => {
        await Promise.all([
          taskService.fail(
            instance.id,
            task.id,
            { message, error: err },
            error,
            transaction,
          ),
          instanceService.fail(instance.id, { message }, transaction),
        ]);
      });
    }
  }
}
