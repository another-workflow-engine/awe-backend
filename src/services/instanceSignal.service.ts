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
import type {
  ActorModel,
  EnvironmentModel,
  InstanceModel,
} from "../types/models.js";
import { openTransaction } from "../utils/database.utils.js";
import { engineUtils } from "../utils/engine.utils.js";
import { environmentUtils } from "../utils/environment.utils.js";
import { eventLogService } from "./eventLog.service.js";
import {
  getFormattedDetailOutput,
  instanceService,
} from "./instance.service.js";
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
) {
  return await openTransaction(async (transaction) => {
    const [{ instance, task, taskExecution }, instanceModels] =
      await Promise.all([
        instanceService.getLockedInProgressOrPausedRelations(
          instanceId,
          transaction,
        ),
        instanceRepository.findByIdAndEnvironmentIdsWithRelations(
          instanceId,
          environmentIds,
        ),
      ]);
    if (!instance || !instanceModels) {
      throw new NotFoundError(`Instance`);
    }

    validateInstanceCanBeSignaledOrThrow(instance, controlSignal);

    if (!task) {
      throw new DataIntegrityError(
        `Task entry for instance id=${instance.id} with status=${instance.status} does not exists`,
      );
    }

    const node = await nodeService.getByIdOrThrow(instance.current_node_id);

    let [updatedInstance] = await Promise.all([
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

    const workflowData = {
      workflow: instanceModels.workflow,
      workflowVersion: instanceModels.workflowVersion,
      node,
    };

    if (
      !(task.status === TaskStatuses.PAUSED || node.type === NodeTypes.USER)
    ) {
      return getFormattedDetailOutput({
        ...workflowData,
        instance: updatedInstance,
        task,
        taskExecution,
      });
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

    const updatedModels = await engineUtils.processControlSignal({
      instance,
      task,
      transaction,
    });

    return getFormattedDetailOutput({
      ...workflowData,
      instance: updatedModels.instance,
      task: updatedModels.task,
    });
  });
}

export const instanceSignalService = {
  signalPause: async (
    instanceId: string,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.PAUSE,
      actor.id,
      environmentUtils.getEnvironmentIds(environments),
    );
  },

  signalTerminate: async (
    instanceId: string,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    return await updateInstanceControlSignal(
      instanceId,
      InstanceControlSignals.TERMINATE,
      actor.id,
      environmentUtils.getEnvironmentIds(environments),
    );
  },
};
