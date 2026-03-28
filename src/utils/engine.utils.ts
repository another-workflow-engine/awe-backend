import { StateTransitionError } from "../errors/StateTransitionError";
import type { InstanceStatus, NodeType } from "../types/database";
import type { ContextVariables, ExecutorResult } from "../types/engine";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums";
import type { InstanceModel, NodeModel } from "../types/models";
import { converterUtils } from "./converter.utils";

export const engineUtils = {
  validateInstanceCanExecuteOrThrow: (instance: InstanceModel) => {
    if (
      instance.status === InstanceStatuses.FAILED ||
      instance.status === InstanceStatuses.TERMINATED ||
      instance.status === InstanceStatuses.COMPLETED
    ) {
      throw new StateTransitionError(
        `Instance has already ${instance.status}. Cannot execute next node.`,
      );
    }

    if (
      !instance.auto_advance &&
      instance.status === InstanceStatuses.IN_PROGRESS
    ) {
      throw new StateTransitionError("Instance is in execution");
    }

    if (instance.auto_advance && instance.status === InstanceStatuses.PAUSED) {
      throw new StateTransitionError(`Instance is ${InstanceStatuses.PAUSED}`);
    }
  },

  getNewInstanceContext(
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
  },

  getNewInstanceStatus(
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
  },
};
