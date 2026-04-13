import { InstanceStatuses } from "../types/enums.js";
import type { ActorModel } from "../types/models.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { userTaskService } from "./userTaskExecution.service.js";

export type DashboardOverview = {
  stats: {
    workflows: number;
    instances: number;
    running: number;
    pending: number;
  };
  instances: Awaited<ReturnType<typeof instanceRepository.findWithPagination>>["items"];
  tasks: Awaited<ReturnType<typeof userTaskService.getPendingPaginated>>["items"];
};

export const dashboardService = {
  getOverview: async (
    actor: ActorModel,
    environmentIds: string[],
  ): Promise<DashboardOverview> => {
    const [workflowTotal, instanceResult, pendingTaskResult, instanceTotal, runningTotal] =
      await Promise.all([
        workflowRepository.countByEnvironmentIds(environmentIds),
        instanceRepository.findRecentByEnvironmentIds(environmentIds, 5),
        userTaskService.getPendingPaginated(actor, environmentIds, 5, 0),
        instanceRepository.countByEnvironmentIds(environmentIds),
        instanceRepository.countByEnvironmentIdsAndStatus(
          environmentIds,
          InstanceStatuses.IN_PROGRESS,
        ),
      ]);

    return {
      stats: {
        workflows: workflowTotal,
        instances: instanceTotal,
        running: runningTotal,
        pending: pendingTaskResult.total,
      },
      instances: instanceResult,
      tasks: pendingTaskResult.items,
    };
  },
};