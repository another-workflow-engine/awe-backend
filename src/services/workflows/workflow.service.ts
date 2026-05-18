import { NotFoundError } from "../../errors/NotFoundError.js";
import { workflowRepository } from "../../repositories/workflow.repository.js";
import type {
  ActorModel,
  EnvironmentModel,
  OrganizationModel,
} from "../../types/models.js";
import type {
  CreateWorkflowInput,
  ListWorkflowInput,
  UpdateWorkflowInput,
} from "../../schemas/workflow.schema.js";
import { paginationUtils } from "../../utils/pagination.utils.js";
import { environmentUtils } from "../../utils/environment.utils.js";
import type { WorkflowDetail, WorkflowListItem } from "../../types/workflow.js";
import { InvalidOperationError } from "../../errors/InvalidOperationError.js";
import type { PaginationResponse } from "../../types/pagination.js";
import { workflowActiveDeploymentRepository } from "../../repositories/workflowActiveDeployment.repository.js";
import { workflowVersionRepository } from "../../repositories/workflowVersion.repository.js";
import { openTransaction } from "../../utils/database.utils.js";

export const workflowService = {
  listPaginated: async (
    data: ListWorkflowInput,
    environments: EnvironmentModel[],
  ): Promise<{
    workflows: WorkflowListItem[];
    pagination: PaginationResponse;
  }> => {
    const selectedEnvironment = environmentUtils.getSelectedEnvironmentOrThrow(
      environments,
      data.environment,
    );

    const { items, total } = await workflowRepository.findPaginated({
      offset: paginationUtils.getOffset(data.page, data.limit),
      limit: data.limit,
      search: data.search,
      createdSort: data.createdSort,
      environmentId: selectedEnvironment.id,
    });

    const pagination = paginationUtils.getPaginationResponse(
      total,
      data.page,
      data.limit,
    );

    return {
      workflows: items,
      pagination,
    };
  },

  create: async (
    data: CreateWorkflowInput,
    actor: ActorModel,
    organization: OrganizationModel,
  ): Promise<WorkflowDetail> => {
    const workflow = await workflowRepository.insert({
      name: data.name,
      description: data.description,
      created_by: actor.id,
      organization_id: organization.id,
      modified_by: actor.id,
    });

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,

      createdAt: workflow.created_on,
      createdBy: actor.type,

      modifiedAt: workflow.modified_on,
      modifiedBy: actor.type,
    };
  },

  get: async (
    workflowId: string,
    organization: OrganizationModel,
  ): Promise<WorkflowDetail> => {
    const workflow = await workflowRepository.findByIdAndOrganizationIdInDetail(
      workflowId,
      organization.id,
    );

    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

    return workflow;
  },

  update: async (
    data: UpdateWorkflowInput,
    actor: ActorModel,
    organization: OrganizationModel,
  ) => {
    const updatedWorkflow =
      await workflowRepository.updateByIdAndOrganizationId(
        data.workflowId,
        organization.id,
        {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          modified_on: new Date(),
          modified_by: actor.id,
        },
      );

    if (!updatedWorkflow) {
      throw new NotFoundError("Workflow");
    }

    return await workflowService.get(updatedWorkflow.id, organization);
  },

  delete: async (
    workflowId: string,
    actor: ActorModel,
    organization: OrganizationModel,
    environments: EnvironmentModel[],
  ) => {
    const environmentIds = environmentUtils.getEnvironmentIds(environments);

    const activeVersionExists =
      await workflowActiveDeploymentRepository.existsByWorkflowIdAndEnvironmentIds(
        workflowId,
        environmentIds,
      );

    if (activeVersionExists) {
      throw new InvalidOperationError(
        "A workflow must not have any active versions before deletion",
      );
    }

    const deleteMetaData = {
      is_deleted: true,
      deleted_on: new Date(),
      deleted_by: actor.id,
    };

    await openTransaction(async (transaction) => {
      const [updatedWorkflow] = await Promise.all([
        workflowRepository.updateByIdAndOrganizationId(
          workflowId,
          organization.id,
          deleteMetaData,
          transaction,
        ),
        workflowVersionRepository.updateByWorkflowId(
          workflowId,
          deleteMetaData,
          transaction,
        ),
      ]);

      if (!updatedWorkflow) {
        throw new NotFoundError("Workflow");
      }
    });
  },
};
