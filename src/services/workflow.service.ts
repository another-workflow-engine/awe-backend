import { NotFoundError } from "../errors/NotFoundError.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import type { ActorModel } from "../types/models.js";
import { environmentService } from "./environment.services.js";

export type CreateWorkflowInput = {
  name: string;
  description: string | null;
};

export type UpdateWorkflowInput = {
  workflowId: string;
  name?: string | undefined;
  description?: string | null | undefined;
};

export const workflowService = {
  getAll: async (actor: ActorModel) => {
    const environment = await environmentService.getByActor(actor);

    return await workflowRepository.findByEnvironmentIdWithLatestVersion(
      environment.id,
    );
  },
  
  getAllPaginated: async (
    actor: ActorModel,
    limit: number,
    offset: number,
  ) => {
    const environment = await environmentService.getByActor(actor);

    return await workflowRepository.findByEnvironmentIdWithLatestVersionPaginated(
      environment.id,
      limit,
      offset,
    );
  },

  get: async (workflowId: string, actor: ActorModel) => {
    const [workflow, versions] = await Promise.all([
      workflowRepository.findById(workflowId),
      workflowVersionRepository.findByWorkflowId(workflowId),
    ]);

    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

    return { workflow, versions };
  },

  create: async (data: CreateWorkflowInput, actor: ActorModel) => {
    const environment = await environmentService.getByActor(actor);

    return await workflowRepository.insert({
      name: data.name,
      description: data.description,
      created_by: actor.id,
      environment_id: environment.id,
      modified_by: actor.id,
    });
  },

  update: async (data: UpdateWorkflowInput, actor: ActorModel) => {
    if (data.name === undefined && data.description === undefined) {
      const workflow = await workflowRepository.findById(data.workflowId);

      if (!workflow) {
        throw new NotFoundError("Workflow");
      }

      return workflow;
    }

    return await workflowRepository.updateById(data.workflowId, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      modified_on: new Date(),
      modified_by: actor.id,
    });
  },

  delete: async (workflowId: string, actor: ActorModel) => {
    return await workflowRepository.updateById(workflowId, {
      is_deleted: true,
      deleted_on: new Date(),
      deleted_by: actor.id,
    });
  },

  getWorkflowName: async (workflowId: string): Promise<string> => {
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new RepositoryError("Workflow not found");
    }
    return workflow.name;
  },
};
