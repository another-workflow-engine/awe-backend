import { db } from "../database.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { WorkflowVersionStatuses } from "../types/enums.js";
import type { ActorModel, WorkflowVersionModel } from "../types/models.js";
import type { Node, Edge } from "../types/workflow.js";
import { edgeService } from "./edge.services.js";
import { nodeService } from "./node.services.js";
import {
  WorkflowVersionDetailRequest,
  WorkflowVersionUpdateStatusRequest,
  WorkflowVersionValidateRequest,
} from "../schemas/workflowVersion.schema.js";
import { z } from "zod";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { workflowValidatorService } from "./workflowValidator.service.js";

type DetailInput = z.infer<typeof WorkflowVersionDetailRequest>;
type StatusPartialUpdateInput = z.infer<
  typeof WorkflowVersionUpdateStatusRequest
>;
type ValidateInput = z.infer<typeof WorkflowVersionValidateRequest>;

export type CreateVersionInput = {
  workflowId: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  deleteContextVariablesOnEnd: boolean;
};

export const workflowVersionService = {
  getDetail: async (data: DetailInput) => {
    const workflowVersion =
      await workflowVersionRepository.findByWorkflowIdAndVersion(
        data.workflowId,
        data.version,
      );
    const nodeModels = await nodeService.getByWorkflowVersion(workflowVersion);
    const edgeModels = await edgeService.getByNodes(nodeModels);

    const nodes = nodeModels.map((node) => nodeService.toNodeSchema(node));
    const edges = edgeModels.map((edge) =>
      edgeService.toEdgeSchema(edge, nodeModels),
    );

    return { workflowVersion, nodes, edges };
  },

  update: async (sub: DetailInput, data: CreateVersionInput) => {
    const workflowVersion =
      await workflowVersionRepository.findByWorkflowIdAndVersion(
        sub.workflowId,
        sub.version,
      );
  },

  createNew: async (
    data: CreateVersionInput,
    actor: ActorModel,
  ): Promise<WorkflowVersionModel> => {
    return db.transaction().execute(async (transaction) => {
      const workflowVersion = await workflowVersionRepository.insertNextVersion(
        {
          description: data.description ?? null,
          created_by: actor.id,
          modified_by: actor.id,
          status: WorkflowVersionStatuses.DRAFT,
          workflow_id: data.workflowId,
        },
        transaction,
      );

      const nodes = await nodeService.createMany(
        data.nodes,
        actor,
        workflowVersion,
        transaction,
      );

      await edgeService.createMany(data.edges, nodes, actor, transaction);

      return workflowVersion;
    });
  },

  validate: async (data: ValidateInput) => {
    let workflowVersion =
      await workflowVersionRepository.findByWorkflowIdAndVersion(
        data.workflowId,
        data.version,
      );

    if (workflowVersion.status !== WorkflowVersionStatuses.DRAFT) {
      return { result: { valid: true, errors: [] }, workflowVersion };
    }
    const nodes = await nodeService.getByWorkflowVersion(workflowVersion);
    const edges = await edgeService.getByNodes(nodes);

    const result = workflowValidatorService.validate(nodes, edges);

    if (result.valid) {
      workflowVersion = await workflowVersionRepository.updateById(
        workflowVersion.id,
        { status: WorkflowVersionStatuses.VALID },
      );
    }

    return { result, workflowVersion };
  },

  changeStatus: async (data: StatusPartialUpdateInput) => {
    return db.transaction().execute(async (transaction) => {
      let workflowVersion =
        await workflowVersionRepository.findByWorkflowIdAndVersion(
          data.workflowId,
          data.version,
          transaction,
        );

      const currentStatus = workflowVersion.status;
      const newStatus = data.status;

      if (currentStatus === WorkflowVersionStatuses.DRAFT) {
        throw new StateTransitionError(
          "Invalid workflow version state transition from DRAFT",
        );
      }

      if (currentStatus === newStatus) {
        return workflowVersion;
      }

      if (newStatus === WorkflowVersionStatuses.ACTIVE) {
        await workflowVersionRepository.demoteActiveVersionToPublished(
          data.workflowId,
          transaction,
        );
      }

      const updatePayload: Partial<typeof workflowVersion> = {
        status: newStatus,
      };

      if (
        !workflowVersion.published_on &&
        (newStatus === WorkflowVersionStatuses.PUBLISHED ||
          newStatus === WorkflowVersionStatuses.ACTIVE)
      ) {
        updatePayload.published_on = new Date();
      }

      workflowVersion = await workflowVersionRepository.updateById(
        workflowVersion.id,
        updatePayload,
        transaction,
      );

      return workflowVersion;
    });
  },
};
