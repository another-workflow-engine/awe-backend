import { NotFoundError } from "../errors/NotFoundError.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import type {
  ActorModel,
  EnvironmentModel,
  WorkflowModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type {
  CreateWorkflowInput,
  ListWorkflowInput,
  UpdateWorkflowInput,
} from "../schemas/workflow.schema.js";
import { paginationUtils } from "../utils/pagination.utils.js";
import { environmentUtils } from "../utils/environment.utils.js";
import type { WorkflowDetail } from "../types/workflow.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { WorkflowVersionStatuses } from "../types/enums.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";

function toWorkflowDetail(
  workflow: WorkflowModel,
  environment: EnvironmentModel,
  latestVersion: WorkflowVersionModel | null,
  modifierActor: ActorModel,
): WorkflowDetail {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,

    environment: environment.type,

    modifiedAt: workflow.modified_on,
    modifiedBy: modifierActor.type,

    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          status: latestVersion.status,
        }
      : null,
  };
}

export const workflowService = {
  listPaginated: async (
    data: ListWorkflowInput,
    environments: EnvironmentModel[],
  ) => {
    const { items, total } =
      await workflowRepository.findByWithLatestVersionPaginated({
        offset: paginationUtils.getOffset(data.page, data.limit),
        limit: data.limit,
        search: data.search,
        createdSort: data.createdSort,
        environmentIds: environmentUtils.getFilteredEnvironmentIds(
          environments,
          data.environmentTypes,
        ),
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
    environments: EnvironmentModel[],
  ): Promise<WorkflowDetail> => {
    const selectedEnvironment = environments.find(
      (env) => env.type === data.environment,
    );

    if (!selectedEnvironment) {
      throw new NotFoundError(`Environment ${data.environment}`);
    }

    const workflow = await workflowRepository.insert({
      name: data.name,
      description: data.description,
      created_by: actor.id,
      environment_id: selectedEnvironment.id,
      modified_by: actor.id,
    });

    return toWorkflowDetail(workflow, selectedEnvironment, null, actor);
  },

  get: async (
    workflowId: string,
    environments: EnvironmentModel[],
  ): Promise<WorkflowDetail> => {
    const models =
      await workflowRepository.findByIdAndEnvironmentIdsWithRelations(
        workflowId,
        environmentUtils.getEnvironmentIds(environments),
      );

    if (!models) {
      throw new NotFoundError("Workflow");
    }

    const { workflow, latestVersion, lastModifier } = models;

    const environment = environments.find(
      (env) => env.id === workflow.environment_id,
    );
    if (!environment) {
      throw new DataIntegrityError(
        `Actor cannnot access workflows in environment id=${workflow.environment_id}`,
      );
    }

    return toWorkflowDetail(workflow, environment, latestVersion, lastModifier);
  },

  update: async (
    data: UpdateWorkflowInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const updatedWorkflow =
      await workflowRepository.updateByIdAndEnvironmentIds(
        data.workflowId,
        {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          modified_on: new Date(),
          modified_by: actor.id,
        },
        environmentUtils.getEnvironmentIds(environments),
      );

    if (!updatedWorkflow) {
      throw new NotFoundError("Workflow");
    }

    return await workflowService.get(updatedWorkflow.id, environments);
  },

  delete: async (
    workflowId: string,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const activeVersionExists =
      await workflowVersionRepository.versionsWithStatusExistsByWorkflowId(
        workflowId,
        [WorkflowVersionStatuses.ACTIVE],
      );

    if (activeVersionExists) {
      throw new InvalidOperationError(
        "A workflow must not have any active versions before deletion",
      );
    }

    const updatedWorkflow =
      await workflowRepository.updateByIdAndEnvironmentIds(
        workflowId,
        {
          is_deleted: true,
          deleted_on: new Date(),
          deleted_by: actor.id,
        },
        environmentUtils.getEnvironmentIds(environments),
      );

    if (!updatedWorkflow) {
      throw new NotFoundError("Workflow");
    }
  },
};
