import { Worker, type Job } from "bullmq";
import type { ConnectionOptions, Queue } from "bullmq";
import type { QueueJob } from "./types.js";
import { instanceRepository } from "../../repositories/instance.repository.js";
import { executionEngine } from "../ExecutionEngine.js";
import {
  ContextVariableScopeType,
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../../types/enums.js";
import { EXECUTION_QUEUE_NAME } from "./BullMQQueue.js";
import { db } from "../../database.js";
import { nodeRepository } from "../../repositories/node.repository.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { converterUtils } from "../../utils/converter.utils.js";
import { contextManager } from "../ContextManager.js";
import type { WorkflowContext } from "../types.js";
import { edgeRepository } from "../../repositories/edge.repository.js";
import { edgeService } from "../../services/edge.services.js";

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
    if (!instance || instance.status !== InstanceStatuses.IN_PROGRESS) {
      throw new DataIntegrityError(
        `Invalid job for node id=${nodeId} in instance id=${instanceId}`,
      );
    }

    const node = await nodeRepository.findById(nodeId);
    if (!node) {
      throw new DataIntegrityError(
        `Node id=${nodeId} not found in for instance id=${instance.id}`,
      );
    }

    const { task, taskExecution } = await executionEngine.runNode(
      instance,
      node,
      context,
    );

    db.transaction().execute(async (tx) => {
      let data = {};
      if (taskExecution.status === TaskStatuses.FAILED) {
        data = { status: InstanceStatuses.FAILED, ended_on: new Date() };
        await instanceRepository.updateById(instance.id, data, tx);
        return;
      } else if (
        taskExecution.status === TaskStatuses.IN_PROGRESS ||
        taskExecution.status === TaskStatuses.TERMINATED
      ) {
        data = { status: InstanceStatuses.PAUSED };
        await instanceRepository.updateById(instance.id, data, tx);
        return;
      }

      if (node.type === NodeTypes.END) {
        data = {
          status: InstanceStatuses.COMPLETED,
          output_variables: taskExecution.output_variables,
          ended_on: new Date(),
        };
        await instanceRepository.updateById(instance.id, data, tx);
        return;
      }

      let updatedContext: WorkflowContext;

      if (node.type === NodeTypes.START) {
        updatedContext = {
          global: converterUtils.jsonValueToObject(
            taskExecution.output_variables,
          ),
          next: {},
        };
      } else {
        const cleared = contextManager.clearNextScope(context);
        updatedContext = contextManager.merge(
          cleared,
          converterUtils.jsonValueToObject(taskExecution.output_variables),
          ContextVariableScopeType.GLOBAL,
        );
      }

      await instanceRepository.updateById(
        instance.id,
        { current_variables: converterUtils.objectToJsonValue(updatedContext) },
        tx,
      );

      if (!instance.auto_advance) {
        await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.PAUSED },
          tx,
        );
        return;
      }

      const nextNodeIds = await edgeService.getNextNodeIdsBySourceNodeId(
        nodeId,
        tx,
      );

      if (nextNodeIds.length === 0) {
        await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.FAILED, ended_on: new Date() },
          tx,
        );
        throw new DataIntegrityError(
          `Instane id=${instanceId} does not have paths after node id=${node.id}`,
        );
      }

      nextNodeIds.forEach(async (nodeId) => {
        await this.queue.add(
          "execute-node",
          {
            instanceId,
            nodeId: nodeId,
            context: updatedContext,
          },
          {
            jobId: `${instanceId}-${nodeId}`,
            ...JOB_OPTIONS,
          },
        );
      });
    });
  }
}
