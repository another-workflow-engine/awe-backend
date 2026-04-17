import { BullMQQueue } from "../engine/queue/BullMQQueue.js";
import { ExecutionWorker } from "../engine/queue/ExecutionWorker.js";
import { redisConnectionOptions } from "../config/redis.js";
import type { QueueJobData } from "../types/engine.js";
import type { BackoffSettings, NodeConfiguration } from "../types/workflow.js";
import { convertToMilliseconds } from "../utils/converter.utils.js";
import { TimeUnit } from "../types/enums.js";
import type { BackoffOptions } from "bullmq";
import { taskExecutionService } from "./taskExecution.service.js";

const bullMQQueue = new BullMQQueue(redisConnectionOptions);
let workerInstance: ExecutionWorker | null = null;

function getBackoffSettings(
  nodeConfiguration: NodeConfiguration,
): BackoffOptions | undefined {
  if (!("backoff" in nodeConfiguration)) {
    return undefined;
  }

  const settings = nodeConfiguration.backoff;

  settings.delay = convertToMilliseconds(settings.delay, settings.unit);
  settings.unit = TimeUnit.MILLISECOND;

  return settings;
}

async function getMaxAttempts(
  nodeConfiguration: NodeConfiguration,
  taskId: string,
  attemptsMade?: number,
): Promise<number> {
  if (!("maxAttempts" in nodeConfiguration)) {
    return 1;
  }

  if (!attemptsMade) {
    const taskExecutions = await taskExecutionService.getByTaskId(taskId);
    attemptsMade = taskExecutions.length;
  }

  return Math.max(1, nodeConfiguration.maxAttempts - attemptsMade);
}

export const queueService = {
  enqueue: async (params: {
    jobData: QueueJobData;
    nodeConfiguration: NodeConfiguration;
    attemptsMade?: number;
  }): Promise<void> => {
    const backoffSettings = getBackoffSettings(params.nodeConfiguration);
    const maxAttempts = await getMaxAttempts(
      params.nodeConfiguration,
      params.jobData.taskId,
      params.attemptsMade,
    );

    await bullMQQueue.enqueue(params.jobData, maxAttempts, backoffSettings);
  },

  startWorker: (): void => {
    workerInstance = new ExecutionWorker(redisConnectionOptions);
  },

  obliterate: async (): Promise<void> => {
    await bullMQQueue.queue.obliterate({ force: true });
  },

  stopWorker: async (): Promise<void> => {
    await workerInstance?.close();
    workerInstance = null;
    await bullMQQueue.close();
  },
};
