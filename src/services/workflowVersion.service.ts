import { db } from "../database.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import {
  FeelDataType,
  NodeTypes,
  WorkflowVersionStatuses,
} from "../types/enums.js";
import type { WorkflowVersionModel } from "../types/models.js";
import { edgeService } from "./edge.services.js";
import { nodeService } from "./node.services.js";
import {
  WorkflowVersionCreateSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionListSchema,
  WorkflowVersionUpdateSchema,
  WorkflowVersionUpdateStatusSchema,
  WorkflowVersionValidateSchema,
} from "../schemas/workflowVersion.schema.js";
import { z } from "zod";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { workflowValidatorService } from "./workflowValidator.service.js";
import { Transaction } from "kysely";
import type { DB } from "../types/database.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import { nodeSchemaService } from "./nodeSchema.service.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";

export type DetailInput = z.infer<typeof WorkflowVersionDetailSchema>;

export type StatusPartialUpdateInput = z.infer<
  typeof WorkflowVersionUpdateStatusSchema
>;

export type ValidateInput = z.infer<typeof WorkflowVersionValidateSchema>;

export type CreateVersionInput = z.infer<typeof WorkflowVersionCreateSchema>;
export type ListVersionInput = z.infer<typeof WorkflowVersionListSchema>;

export type UpdateVersionInput = z.infer<typeof WorkflowVersionUpdateSchema>;

export const workflowVersionService = {
  listPaginated: async (
    data: ListVersionInput,
    limit: number,
    offset: number,
  ) => {
    return await workflowVersionRepository.findByWorkflowIdPaginated(
      data.workflowId,
      limit,
      offset,
    );
  },

  getActiveVersionByWorkflowId: async (
    workflowId: string,
    transaction?: Transaction<DB>,
  ): Promise<WorkflowVersionModel | undefined> => {
    return await workflowVersionRepository.findActiveVersionByWorkflowId(
      workflowId,
      transaction,
    );
  },

  getDetail: async (data: DetailInput) => {
    const workflowVersion =
      await workflowVersionRepository.findByWorkflowIdAndVersion(
        data.workflowId,
        data.version,
      );

    const nodeModels = await nodeService.getByWorkflowVersion(workflowVersion);
    const edgeModels = await edgeService.getByNodes(nodeModels);

    const nodes = nodeModels.map((node) =>
      nodeSchemaService.getNodeSchema(node),
    );
    const edges = edgeModels.map((edge) =>
      edgeService.toEdgeSchema(edge, nodeModels),
    );

    const startVariables: { jsonPath: string; dataType: FeelDataType }[] = [];
    const startNode = nodes.find((node) => node.type === NodeTypes.START);
    if (
      !startNode &&
      workflowVersion.status !== WorkflowVersionStatuses.DRAFT
    ) {
      throw new DataIntegrityError(
        `Workflow version id = ${workflowVersion.id} does not have start node for its status = ${workflowVersion.status}`,
      );
    }

    if (startNode) {
      startNode.configuration.inputDataMap.forEach((data) => {
        if (!data.fetchableId) {
          startVariables.push({
            jsonPath: data.jsonPath,
            dataType: data.dataType,
          });
        }
      });
    }

    return { workflowVersion, nodes, edges, startVariables };
  },

  update: async (data: UpdateVersionInput): Promise<WorkflowVersionModel> => {
    return db.transaction().execute(async (transaction) => {
      const workflowVersion =
        await workflowVersionRepository.findByWorkflowIdAndVersion(
          data.workflowId,
          data.version,
          transaction,
        );

      if (
        workflowVersion.status === WorkflowVersionStatuses.PUBLISHED ||
        workflowVersion.status === WorkflowVersionStatuses.ACTIVE
      ) {
        throw new StateTransitionError(
          `Workflow version ${data.version} cannot be updated because it is in ${workflowVersion.status} status`,
        );
      }

      const existingNodes = await nodeService.getByWorkflowVersion(
        workflowVersion,
        transaction,
      );
      await edgeService.deleteByNodes(existingNodes, transaction);
      await nodeService.deleteByWorkflowVersion(workflowVersion, transaction);

      const newNodes = await nodeService.createMany(
        data.nodes,
        data.actor,
        workflowVersion,
        transaction,
      );
      await edgeService.createMany(
        data.edges,
        newNodes,
        data.actor,
        transaction,
      );

      return await workflowVersionRepository.updateById(
        workflowVersion.id,
        {
          ...(data.description !== undefined && {
            description: data.description,
          }),
          modified_by: data.actor.id,
          modified_on: new Date(),
          status: WorkflowVersionStatuses.DRAFT,
        },
        transaction,
      );
    });
  },

  createNew: async (
    data: CreateVersionInput,
  ): Promise<WorkflowVersionModel> => {
    return db.transaction().execute(async (transaction) => {
      
      const doesDraftOrValidVersionExists = await workflowVersionRepository.doesDraftOrValidVersionExists(
        data.workflowId,
        transaction,
      );

      if (doesDraftOrValidVersionExists) {
        throw new InvalidOperationError(
          "DRAFT or VALID version already exists for this workflow.",
        );
      }

      const workflowVersion = await workflowVersionRepository.insertNextVersion(
        {
          description: data.description ?? null,
          created_by: data.actor.id,
          modified_by: data.actor.id,
          status: WorkflowVersionStatuses.DRAFT,
          workflow_id: data.workflowId,
        },
        transaction,
      );

      const nodes = await nodeService.createMany(
        data.nodes,
        data.actor,
        workflowVersion,
        transaction,
      );

      await edgeService.createMany(data.edges, nodes, data.actor, transaction);

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
    let workflowVersion =
      await workflowVersionRepository.findByWorkflowIdAndVersion(
        data.workflowId,
        data.version,
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

    return db.transaction().execute(async (transaction) => {
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
