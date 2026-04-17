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
import { instanceService } from "./instance.service.js";
import { nodeService } from "./node.services.js";
import { taskExecutionService } from "./taskExecution.service.js";

const controlSignalToEventMap: Record<
  InstanceControlSignal,
  InstanceEventType
> = {
  pause: LogEventTypes.PAUSE_REQUESTED,
  terminate: LogEventTypes.TERMINATE_REQUESTED,
};

function validateInstanceCanBeSignaledOrThrow(
  instance: InstanceModel,
  controlSignal: InstanceControlSignal,
): asserts instance is InstanceModel & { current_node_id: string } {
  engineUtils.validateInstanceHasNotEndedOrThrow(instance.status);

  if (
    controlSignal === InstanceControlSignals.PAUSE &&
    instance.status === InstanceStatuses.PAUSED
  ) {
    throw new StateTransitionError(
      `Instance is already ${InstanceStatuses.PAUSED}`,
    );
  }

  if (
    instance.control_signal !== null &&
    instance.control_signal !== controlSignal
  ) {
    throw new StateTransitionError(
      `Instance is being ${instance.control_signal}ed`,
    );
  }

  if (instance.current_node_id === null) {
    throw new DataIntegrityError(
      `No current node for instance id=${instance.id}`,
    );
  }
}

async function updateInstanceControlSignal(
  instanceId: string,
  controlSignal: InstanceControlSignal,
  actorId: string,
  environmentIds: string[],
): Promise<InstanceModel> {
  return await db.transaction().execute(async (transaction) => {
    let { instance, task, taskExecution } =
      await instanceService.getLockedInProgressOrPausedRelations(
        instanceId,
        environmentIds,
        transaction,
      );
    if (!instance) {
      throw new NotFoundError(`Instance`);
    }

    validateInstanceCanBeSignaledOrThrow(instance, controlSignal);

    if (instance.control_signal === controlSignal) {
      return instance;
    }

    if (!task) {
      throw new DataIntegrityError(
        `Task entry for instance id=${instance.id} with status=${instance.status} does not exists`,
      );
    }

    const node = await nodeService.getByIdOrThrow(instance.current_node_id);

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

    const canHandleImmediately =
      task.status === TaskStatuses.PAUSED || node.type === NodeTypes.USER;

    if (!canHandleImmediately) {
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

    ({ instance } = await engineUtils.processControlSignal({
      instance,
      task,
      transaction,
    }));

    return instance;
  });
}

export const instanceSignalService = {
  signalPause: async (
    instanceId: string,
    actor: ActorModel,
    environmentIds: string[],
  ): Promise<InstanceModel> => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.PAUSE,
      actor.id,
      environmentIds,
    );
  },

  signalTerminate: async (
    instanceId: string,
    actor: ActorModel,
    environmentIds: string[],
  ): Promise<InstanceModel> => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.TERMINATE,
      actor.id,
      environmentIds,
    );
  },
};
