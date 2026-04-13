import { NotFoundError } from "../errors/NotFoundError.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import type { ActorModel } from "../types/models.js";
import { randomUUID } from "crypto";

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
  getAll: async (environmentIds: string[]) => {
    return await workflowRepository.findByEnvironmentIdsWithLatestVersion(
      environmentIds,
    );
  },

  getAllPaginated: async (
    environmentIds: string[],
    limit: number,
    offset: number,
  ) => {
    return await workflowRepository.findByEnvironmentIdsWithLatestVersionPaginated(
      environmentIds,
      limit,
      offset,
    );
  },

  get: async (workflowId: string, environmentIds: string[]) => {
    const [workflow, versions] = await Promise.all([
      workflowRepository.findByIdAndEnvironmentIds(workflowId, environmentIds),
      workflowVersionRepository.findByWorkflowId(workflowId),
    ]);

    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

    return { workflow, versions };
  },

  create: async (
    data: CreateWorkflowInput,
    actor: ActorModel,
    environmentId: string,
  ) => {
    const workflowId = randomUUID();

    return await workflowRepository.insert({
      id: workflowId,
      name: data.name,
      description: data.description,
      created_by: actor.id,
      environment_id: environmentId,
      base_workflow_id: workflowId,
      modified_by: actor.id,
    });
  },

  update: async (
    data: UpdateWorkflowInput,
    actor: ActorModel,
    environmentIds: string[],
  ) => {
    const existing = await workflowRepository.findByIdAndEnvironmentIds(
      data.workflowId,
      environmentIds,
    );

    if (!existing) {
      throw new NotFoundError("Workflow");
    }

    if (data.name === undefined && data.description === undefined) {
      return existing;
    }

    return await workflowRepository.updateById(data.workflowId, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      modified_on: new Date(),
      modified_by: actor.id,
    });
  },

  delete: async (
    workflowId: string,
    actor: ActorModel,
    environmentIds: string[],
  ) => {
    const existing = await workflowRepository.findByIdAndEnvironmentIds(
      workflowId,
      environmentIds,
    );

    if (!existing) {
      throw new NotFoundError("Workflow");
    }

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
