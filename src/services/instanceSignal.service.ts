import { db } from "../database.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import type {
  InstanceControlSignal,
  InstanceEventType,
} from "../types/database.js";
import {
  InstanceControlSignals,
  InstanceStatuses,
  LogEventTypes,
  NodeTypes,
  TaskStatuses,
} from "../types/enums.js";
import type { ActorModel, InstanceModel } from "../types/models.js";
import { engineUtils } from "../utils/engine.utils.js";
import { eventLogService } from "./eventLog.service.js";
import { nodeService } from "./node.services.js";
import { taskExecutionService } from "./taskExecution.service.js";

const controlSignalToEventMap: Record<
  InstanceControlSignal,
  InstanceEventType
> = {
  pause: LogEventTypes.PAUSE_REQUESTED,
  terminate: LogEventTypes.TERMINATE_REQUESTED,
};

async function updateInstanceControlSignal(
  instanceId: string,
  controlSignal: InstanceControlSignal,
  actorId: string,
): Promise<InstanceModel> {
  return await db.transaction().execute(async (transaction) => {
    const models =
      await instanceRepository.getLockedInProgressOrPausedRelationsById(
        instanceId,
        transaction,
      );
    if (!models) {
      throw new NotFoundError(`Instance`);
    }

    let instance = models.instance;

    engineUtils.validateInstanceHasNotEndedOrThrow(instance.status);

    // if the instance has not ended then it must have:
    //    - 1 task that is either paused or in progress
    //    - 0 or 1 executions that are is in progress
    if (
      instance.status !== InstanceStatuses.PAUSED &&
      (models.tasks.length !== 1 || models.taskExecutions.length > 1)
    ) {
      throw new DataIntegrityError(
        `Instance id=${instanceId} has an invalid number of tasks or executions in progress`,
      );
    }

    if (
      controlSignal === InstanceControlSignals.PAUSE &&
      instance.status === InstanceStatuses.PAUSED
    ) {
      throw new StateTransitionError(`Instance is ${InstanceStatuses.PAUSED}`);
    }

    if (instance.control_signal !== null) {
      throw new StateTransitionError(
        `Instance is being ${instance.control_signal}ed`,
      );
    }

    [instance] = await Promise.all([
      instanceRepository.updateById(
        instance.id,
        { control_signal: controlSignal },
        transaction,
      ),

      eventLogService.createInstanceLog({
        instanceId: instance.id,
        eventType: controlSignalToEventMap[controlSignal],
        actorId: actorId,
        transaction,
      }),
    ]);

    if (instance.current_node_id === null) {
      throw new DataIntegrityError(
        `No current node for instance id=${instance.id}`,
      );
    }

    const node = await nodeService.getByIdOrThrow(instance.current_node_id);
    const task = models.tasks[0]!;
    const taskExecution = models.taskExecutions[0];

    if (node.type !== NodeTypes.USER) {
      return instance;
    }

    if (taskExecution) {
      await taskExecutionService.terminate(
        instance.id,
        taskExecution.id,
        {
          message: `Task ${controlSignal}ed`,
        },
        transaction,
      );
    }

    ({ instance } = await engineUtils.handleInstanceControlSignal(
      instance,
      task,
      node,
      transaction,
    ));

    return instance;
  });
}

export const instanceSignalService = {
  signalPause: async (
    instanceId: string,
    actor: ActorModel,
  ): Promise<InstanceModel> => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.PAUSE,
      actor.id,
    );
  },

  signalTerminate: async (
    instanceId: string,
    actor: ActorModel,
  ): Promise<InstanceModel> => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.TERMINATE,
      actor.id,
    );
  },
};
