import { InstanceStatuses, TaskStatuses } from "../types/enums.js";
import type { EnvironmentModel } from "../types/models.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { environmentUtils } from "../utils/environment.utils.js";
import type { EnvironmentType } from "../types/database.js";
import { userTaskExecutionRepository } from "../repositories/userTaskExecution.repository.js";

export type DashboardOverview = {
  totalWorkflows: number;
  totalInstances: number;
  totalRunningInstances: number;
  totalPendingUserTasks: number;
};

export const dashboardService = {
  getOverview: async (
    selectedEnvironmentTypes: EnvironmentType[],
    environments: EnvironmentModel[],
  ): Promise<DashboardOverview> => {
    const environmentIds = environmentUtils.getFilteredEnvironmentIds(
      environments,
      selectedEnvironmentTypes,
    );

    if (environmentIds.length === 0) {
      return {
        totalWorkflows: 0,
        totalInstances: 0,
        totalRunningInstances: 0,
        totalPendingUserTasks: 0,
      };
    }

    const [
      totalWorkflows,
      totalRunningInstances,
      totalInstances,
      totalPendingUserTasks,
    ] = await Promise.all([
      workflowRepository.countByEnvironmentIds(environmentIds),
      instanceRepository.countByEnvironmentIdsAndStatus(
        environmentIds,
        InstanceStatuses.IN_PROGRESS,
      ),
      instanceRepository.countByEnvironmentIds(environmentIds),
      userTaskExecutionRepository.countByEnvironmentIdsAndStatus(
        environmentIds,
        TaskStatuses.IN_PROGRESS,
      ),
    ]);

    return {
      totalWorkflows,
      totalRunningInstances,
      totalInstances,
      totalPendingUserTasks,
    };
  },
};
