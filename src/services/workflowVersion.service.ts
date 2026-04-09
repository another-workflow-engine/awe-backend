import { db } from "../database.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import {
  ActorTypes,
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
  WorkflowVersionPromoteSchema,
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
import { NotFoundError } from "../errors/NotFoundError.js";

export type DetailInput = z.infer<typeof WorkflowVersionDetailSchema>;
export type StatusPartialUpdateInput = z.infer<typeof WorkflowVersionUpdateStatusSchema>;
export type ValidateInput = z.infer<typeof WorkflowVersionValidateSchema>;
export type CreateVersionInput = z.infer<typeof WorkflowVersionCreateSchema>;
export type ListVersionInput = z.infer<typeof WorkflowVersionListSchema>;
export type UpdateVersionInput = z.infer<typeof WorkflowVersionUpdateSchema>;
export type PromoteVersionInput = z.infer<typeof WorkflowVersionPromoteSchema>;

const getVersionOrThrow = async (
  versionId: string,
  environmentId: string,
  transaction?: Transaction<DB>,
) => {
  const version = await workflowVersionRepository.findByIdAndEnvironmentId(
    versionId,
    environmentId,
    transaction,
  );
  if (!version) {
    throw new NotFoundError("Workflow version");
  }
  return version;
};

export const workflowVersionService = {

  listPaginated: async (
    data: ListVersionInput,
    limit: number,
    offset: number,
    environmentId: string,
  ) => {
    const workflow = await workflowRepository.findByIdAndEnvironmentId(
      data.workflowId,
      environmentId,
    );

    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

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

  getDetail: async (data: DetailInput, environmentId: string) => {
    const workflowVersion = await getVersionOrThrow(data.versionId, environmentId);

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

  update: async (
    data: UpdateVersionInput,
    environmentId: string,
  ): Promise<WorkflowVersionModel> => {
    return db.transaction().execute(async (transaction) => {
      const workflowVersion = await getVersionOrThrow(
        data.versionId,
        environmentId,
        transaction,
      );

      if (
        workflowVersion.status === WorkflowVersionStatuses.PUBLISHED ||
        workflowVersion.status === WorkflowVersionStatuses.ACTIVE
      ) {
        throw new StateTransitionError(
          `Workflow version ${workflowVersion.id} cannot be updated because it is in ${workflowVersion.status} status`,
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
    existingTransaction?: Transaction<DB>,
    environmentId?: string,
  ): Promise<WorkflowVersionModel> => {
    const createInTransaction = async (transaction: Transaction<DB>) => {
      if (environmentId) {
        const workflow = await workflowRepository.findByIdAndEnvironmentId(
          data.workflowId,
          environmentId,
          transaction,
        );

        if (!workflow) {
          throw new NotFoundError("Workflow");
        }
      }

      const exists =
        await workflowVersionRepository.doesDraftOrValidVersionExists(
          data.workflowId,
          transaction,
        );

      if (exists) {
        throw new InvalidOperationError(
          "DRAFT or VALID version already exists for this workflow.",
        );
      }

      const workflowVersion =
        await workflowVersionRepository.insertNextVersion(
          {
            description: data.description ?? null,
            created_by: data.actor.id,
            modified_by: data.actor.id,
            status: data.status,
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

      await edgeService.createMany(
        data.edges,
        nodes,
        data.actor,
        transaction,
      );

      return workflowVersion;
    };

    if (existingTransaction) {
      return await createInTransaction(existingTransaction);
    }

    return db.transaction().execute(createInTransaction);
  },

  validate: async (data: ValidateInput, environmentId: string) => {
    let workflowVersion = await getVersionOrThrow(data.versionId, environmentId);

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

  changeStatus: async (
    data: StatusPartialUpdateInput,
    environmentId: string,
  ) => {
    let workflowVersion = await getVersionOrThrow(data.versionId, environmentId);

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
          workflowVersion.workflow_id,
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

  clone: async (data: DetailInput, environmentId: string) => {
    const workflowVersion = await getVersionOrThrow(data.versionId, environmentId);

    const nodes = await nodeService.getByWorkflowVersion(workflowVersion);
    const edges = await edgeService.getByNodes(nodes);

    return workflowVersionService.createNew({
      workflowId: workflowVersion.workflow_id,
      description: `Clone of version ${workflowVersion.version} - ${workflowVersion.description}`,
      nodes: nodes.map((node) => nodeSchemaService.getNodeSchema(node)),
      edges: edges.map((edge) => edgeService.toEdgeSchema(edge, nodes)),
      status: WorkflowVersionStatuses.VALID,
      actor: data.actor,
    }, undefined, environmentId);

  },

  promoteWorkflowVersion: async (
    sourceVersionId: string,
    targetEnvironmentId: string,
    actorId: string,
  ) => {
    return await db.transaction().execute(async (transaction) => {
      const sourceVersion = await workflowVersionRepository.findById(
        sourceVersionId,
        transaction,
      );

      if (!sourceVersion) {
        throw new NotFoundError("Workflow version");
      }

      const sourceWorkflow = await workflowRepository.findById(
        sourceVersion.workflow_id,
        transaction,
      );

      if (!sourceWorkflow) {
        throw new NotFoundError("Workflow");
      }

      const baseWorkflowId = sourceWorkflow.base_workflow_id ?? sourceWorkflow.id;

     

      let targetWorkflow =
        await workflowRepository.findByBaseWorkflowIdAndEnvironmentId(
          baseWorkflowId,
          targetEnvironmentId,
          transaction,
        );

      if (!targetWorkflow) {
        targetWorkflow = await workflowRepository.insert(
          {
            name: sourceWorkflow.name,
            description: sourceWorkflow.description,
            environment_id: targetEnvironmentId,
            base_workflow_id: baseWorkflowId,
            created_by: actorId,
            modified_by: actorId,
          },
          transaction,
        );
      }

      const sourceNodes = await nodeService.getByWorkflowVersion(
        sourceVersion,
        transaction,
      );
      const sourceEdges = await edgeService.getByNodesWithTransaction(
        sourceNodes,
        transaction,
      );

      const promotedVersion = await workflowVersionService.createNew(
        {
          workflowId: targetWorkflow.id,
          description: sourceVersion.description,
          nodes: sourceNodes.map((node) => nodeSchemaService.getNodeSchema(node)),
          edges: sourceEdges.map((edge) =>
            edgeService.toEdgeSchema(edge, sourceNodes),
          ),
          status: WorkflowVersionStatuses.DRAFT,
          actor: {
            id: actorId,
            type: ActorTypes.ORGANIZATION_ACCOUNT,
          },
        },
        transaction,
        targetEnvironmentId,
      );

      return {
        workflowId: targetWorkflow.id,
        versionId: promotedVersion.id,
      };
    });
  },

  promote: async (data: PromoteVersionInput, targetEnvironmentId: string) => {
    return await workflowVersionService.promoteWorkflowVersion(
      data.versionId,
      targetEnvironmentId,
      data.actor.id,
    );

  }

};