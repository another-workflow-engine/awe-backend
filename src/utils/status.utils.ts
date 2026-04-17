import type { InstanceStatus, TaskStatus } from "../types/database.js";
import { InstanceStatuses, TaskStatuses } from "../types/enums.js";
import type { InstanceModel } from "../types/models.js";

export const statusUtils = {
  instanceHasEnded: (status: InstanceStatus): boolean => {
    const terminalStates: InstanceStatus[] = [
      InstanceStatuses.TERMINATED,
      InstanceStatuses.COMPLETED,
      InstanceStatuses.FAILED,
    ];
    return terminalStates.includes(status);
  },

  instanceCanExecute: (instance: InstanceModel): boolean => {
    return !(
      instance.auto_advance &&
      instance.status === InstanceStatuses.PAUSED &&
      statusUtils.instanceHasEnded(instance.status)
    );
  },

  taskHasEnded: (status: TaskStatus): boolean => {
    const terminalStates: TaskStatus[] = [
      TaskStatuses.FAILED,
      TaskStatuses.TERMINATED,
      TaskStatuses.COMPLETED,
    ];
    return terminalStates.includes(status);
  },
};
