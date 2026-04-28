import { NotFoundError } from "../errors/NotFoundError.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import type { ActorModel, EnvironmentModel } from "../types/models.js";
import { randomUUID } from "crypto";
import type z from "zod";
import type {
  WorkflowGroupCreateSchema,
  WorkflowGroupUpdateSchema,
} from "../schemas/workflow.schema.js";

type CreateWorkflowInput = z.infer<typeof WorkflowGroupCreateSchema>;

type UpdateWorkflowInput = z.infer<typeof WorkflowGroupUpdateSchema>;

export type WorkflowListQuery = {
  search?: string;
  createdSort?: "asc" | "desc";
};

export const workflowService = {
  getAllPaginated: async (
    environmentIds: string[],
    limit: number,
    offset: number,
    query?: WorkflowListQuery,
  ) => {
    return await workflowRepository.findByEnvironmentIdsWithLatestVersionPaginated(
      environmentIds,
      limit,
      offset,
      query?.search,
      query?.createdSort ?? "desc",
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
    environments: EnvironmentModel[],
  ) => {
    const selectedEnvironment = environments.find(
      (env) => env.type === data.environment,
    );
    if (!selectedEnvironment) {
      throw new NotFoundError("Environment");
    }

    const workflowId = randomUUID();

    return await workflowRepository.insert({
      id: workflowId,
      name: data.name,
      description: data.description,
      created_by: actor.id,
      environment_id: selectedEnvironment.id,
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
};
