import { db } from "../database.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { workflowRepository } from "../repositories/workflow.repository.js";
import {
  ActorTypes,
  EnvironmentTypes,
  FeelDataType,
  NodeTypes,
  WorkflowVersionStatuses,
} from "../types/enums.js";
import type {
  ActorModel,
  DbTransaction,
  EnvironmentModel,
  WorkflowVersionModel,
} from "../types/models.js";
import { edgeService } from "./edge.services.js";
import { nodeService } from "./node.services.js";
import {
  WorkflowVersionCreateSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionListSchema,
  WorkflowVersionPromoteSchema,
  WorkflowVersionPromoteResponseSchema,
  WorkflowVersionUpdateSchema,
  WorkflowVersionUpdateStatusSchema,
  WorkflowVersionValidateSchema,
} from "../schemas/workflowVersion.schema.js";
import { z } from "zod";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import {
  workflowValidatorService,
  type ValidationResult,
} from "./workflowValidator.service.js";
import { Transaction } from "kysely";
import type { DB, EnvironmentType } from "../types/database.js";
import { InvalidOperationError } from "../errors/InvalidOperationError.js";
import { nodeSchemaService } from "./nodeSchema.service.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { AuthError } from "../errors/AuthError.js";
import type { Edge, Node } from "../types/workflow.js";
import { converterUtils } from "../utils/converter.utils.js";
import { coerce } from "semver";
import { DataIntegrityError } from "../errors/DataIntegrity.js";

export type DetailInput = z.infer<typeof WorkflowVersionDetailSchema>;
export type StatusPartialUpdateInput = z.infer<
  typeof WorkflowVersionUpdateStatusSchema
>;
export type ValidateInput = z.infer<typeof WorkflowVersionValidateSchema>;
export type CreateVersionInput = z.infer<typeof WorkflowVersionCreateSchema>;
export type ListVersionInput = z.infer<typeof WorkflowVersionListSchema>;
export type UpdateVersionInput = z.infer<typeof WorkflowVersionUpdateSchema>;
export type PromoteVersionInput = z.infer<typeof WorkflowVersionPromoteSchema>;
export type PromoteVersionOutput = z.infer<
  typeof WorkflowVersionPromoteResponseSchema
>;

const nextPromotionTargetByEnvironment: Record<
  EnvironmentType,
  EnvironmentType | null
> = {
  [EnvironmentTypes.DEVELOPMENT]: EnvironmentTypes.STAGING,
  [EnvironmentTypes.STAGING]: EnvironmentTypes.PRODUCTION,
  [EnvironmentTypes.PRODUCTION]: null,
};

const getVersionOrThrow = async (
  versionId: string,
  environments: EnvironmentModel[],
) => {
  const models =
    await workflowVersionRepository.findByIdWithWorkflow(versionId);

  if (
    !models ||
    !models.workflowVersion ||
    !environments.find((env) => env.id === models.workflow.environment_id)
  ) {
    throw new NotFoundError("Workflow version");
  }
  return models;
};

async function createNodesEdgesAndValid(params: {
  nodes: Node[];
  edges: Edge[];
  actor: ActorModel;
  workflowVersion: WorkflowVersionModel;
  transaction: DbTransaction;
}): Promise<ValidationResult> {
  const nodeModels = await nodeService.createMany(
    params.nodes,
    params.actor,
    params.workflowVersion,
    params.transaction,
  );

  const edgeModels = await edgeService.createMany(
    params.edges,
    nodeModels,
    params.actor,
    params.transaction,
  );

  return workflowValidatorService.validate(nodeModels, edgeModels);
}

export const workflowVersionService = {
  listPaginated: async (
    data: ListVersionInput,
    limit: number,
    offset: number,
    environmentIds: string[],
  ) => {
    const workflow = await workflowRepository.findByIdAndEnvironmentIds(
      data.workflowId,
      environmentIds,
    );

    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

    const versions = await workflowVersionRepository.findByWorkflowIdPaginated(
      data.workflowId,
      limit,
      offset,
    );

    return {
      workflow,
      ...versions,
    };
  },

  getActiveVersionByWorkflowId: async (
    workflowId: string,
    environmentIds?: string[],
    transaction?: Transaction<DB>,
  ): Promise<WorkflowVersionModel | undefined> => {
    return await workflowVersionRepository.findActiveVersionByWorkflowId(
      workflowId,
      environmentIds,
      transaction,
    );
  },

  getDetail: async (data: DetailInput, environments: EnvironmentModel[]) => {
    const { workflowVersion, workflow } = await getVersionOrThrow(
      data.versionId,
      environments,
    );

    const nodeModels = await nodeService.getByWorkflowVersion(workflowVersion);
    const edgeModels = await edgeService.getByNodes(nodeModels);

    const nodes = nodeModels.map((node) =>
      nodeSchemaService.getNodeSchema(node),
    );

    const edges = edgeModels.map((edge) =>
      edgeService.toEdgeSchema(edge, nodeModels),
    );

    const startVariables: {
      jsonPath: string;
      dataType: FeelDataType;
      required: boolean;
      defaultValue?: unknown;
    }[] = [];

    const startNode = nodes.find((node) => node.type === NodeTypes.START);

    if (startNode) {
      startNode.configuration.inputDataMap.forEach((data) => {
        if (!data.fetchableId) {
          startVariables.push({
            jsonPath: data.jsonPath,
            dataType: data.dataType,
            required: data.required !== false,
            ...(data.required === false
              ? { defaultValue: data.defaultValue }
              : {}),
          });
        }
      });
    }

    return { workflow, workflowVersion, nodes, edges, startVariables };
  },

  update: async (
    data: UpdateVersionInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    let { workflowVersion } = await getVersionOrThrow(
      data.versionId,
      environments,
    );

    if (
      workflowVersion.status === WorkflowVersionStatuses.PUBLISHED ||
      workflowVersion.status === WorkflowVersionStatuses.ACTIVE
    ) {
      throw new StateTransitionError(
        `Workflow version ${workflowVersion.id} cannot be updated because it is in ${workflowVersion.status} status`,
      );
    }

    return db.transaction().execute(async (transaction) => {
      const existingNodes = await nodeService.getByWorkflowVersion(
        workflowVersion,
        transaction,
      );

      await edgeService.deleteByNodes(existingNodes, transaction);
      await nodeService.deleteByWorkflowVersion(workflowVersion, transaction);

      const result = await createNodesEdgesAndValid({
        nodes: data.nodes,
        edges: data.edges,
        actor,
        workflowVersion,
        transaction,
      });
      const status = result.valid
        ? WorkflowVersionStatuses.VALID
        : WorkflowVersionStatuses.DRAFT;

      workflowVersion = await workflowVersionRepository.updateById(
        workflowVersion.id,
        {
          ...(data.description !== undefined && {
            description: data.description,
          }),
          modified_by: actor.id,
          modified_on: new Date(),
          status,
        },
        transaction,
      );

      return { result, workflowVersion };
    });
  },

  validate: async (data: ValidateInput, environments: EnvironmentModel[]) => {
    const { workflowVersion } = await getVersionOrThrow(
      data.versionId,
      environments,
    );

    if (workflowVersion.status !== WorkflowVersionStatuses.DRAFT) {
      return { result: { valid: true, errors: [] }, workflowVersion };
    }

    const nodes = await nodeService.getByWorkflowVersion(workflowVersion);
    const edges = await edgeService.getByNodes(nodes);

    const result = workflowValidatorService.validate(nodes, edges);

    return { result, workflowVersion };
  },

  createNew: async (
    data: CreateVersionInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
    transaction?: DbTransaction,
  ) => {
    const executeCallback = async (transaction: Transaction<DB>) => {
      const workflow = await workflowRepository.findById(
        data.workflowId,
        transaction,
      );
      if (
        !workflow ||
        !environments.find((env) => env.id === workflow.environment_id)
      ) {
        throw new NotFoundError("workflow");
      }

      const exists = await workflowVersionRepository.draftOrValidVersionExists(
        data.workflowId,
        transaction,
      );

      if (exists) {
        throw new InvalidOperationError(
          "DRAFT version already exists for this workflow.",
        );
      }

      let workflowVersion = await workflowVersionRepository.insert(
        {
          version: null,
          description: data.description ?? null,
          created_by: actor.id,
          modified_by: actor.id,
          status: WorkflowVersionStatuses.DRAFT,
          workflow_id: data.workflowId,
        },
        transaction,
      );

      const result = await createNodesEdgesAndValid({
        nodes: data.nodes,
        edges: data.edges,
        actor,
        workflowVersion,
        transaction,
      });
      if (result.valid) {
        workflowVersion = await workflowVersionRepository.updateById(
          workflowVersion.id,
          {
            status: WorkflowVersionStatuses.VALID,
          },
          transaction,
        );
      }

      return { result, workflowVersion };
    };

    return transaction
      ? await executeCallback(transaction)
      : await db.transaction().execute(executeCallback);
  },

  changeStatus: async (
    data: StatusPartialUpdateInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const { workflowVersion } = await getVersionOrThrow(
      data.versionId,
      environments,
    );

    const currentStatus = workflowVersion.status;
    const newStatus = data.status;

    if (currentStatus === WorkflowVersionStatuses.DRAFT) {
      throw new StateTransitionError("Workflow definition is not valid");
    }

    if (currentStatus === newStatus) {
      throw new StateTransitionError(`Workflow is in ${currentStatus} state`);
    }

    return db.transaction().execute(async (transaction) => {
      // demote active version before activating
      if (newStatus === WorkflowVersionStatuses.ACTIVE) {
        await workflowVersionRepository.demoteActiveVersionToPublished(
          workflowVersion.workflow_id,
          transaction,
        );
      }

      const updatePayload: Partial<typeof workflowVersion> = {
        status: newStatus,
        modified_on: new Date(),
        modified_by: actor.id,
      };

      if (
        !workflowVersion.published_on &&
        (newStatus === WorkflowVersionStatuses.PUBLISHED ||
          newStatus === WorkflowVersionStatuses.ACTIVE)
      ) {
        updatePayload.published_on = new Date();
        const previousWorkflowVersion =
          await workflowVersionRepository.findLatestNonNullVersionByWorkflowId(
            workflowVersion.workflow_id,
            transaction,
          );
        const previousVersion = coerce(previousWorkflowVersion?.version ?? "0");
        if (!previousVersion) {
          throw new DataIntegrityError(
            `Invalid semver version=${previousVersion}`,
          );
        }
        updatePayload.version = previousVersion.inc(data.incrementType).version;
      }

      return await workflowVersionRepository.updateById(
        workflowVersion.id,
        updatePayload,
        transaction,
      );
    });
  },

  clone: async (
    data: DetailInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ) => {
    const { workflowVersion } = await getVersionOrThrow(
      data.versionId,
      environments,
    );

    const nodes = await nodeService.getByWorkflowVersion(workflowVersion);
    const edges = await edgeService.getByNodes(nodes);

    return workflowVersionService.createNew(
      {
        workflowId: workflowVersion.workflow_id,
        description: `Clone of version ${workflowVersion.version} - ${workflowVersion.description}`,
        nodes: nodes.map((node) => nodeSchemaService.getNodeSchema(node)),
        edges: edges.map((edge) => edgeService.toEdgeSchema(edge, nodes)),
      },
      actor,
      environments,
    );
  },

  promote: async (
    data: PromoteVersionInput,
    actor: ActorModel,
    environments: EnvironmentModel[],
  ): Promise<PromoteVersionOutput> => {
    if (actor.type !== ActorTypes.ORGANIZATION_ACCOUNT) {
      throw new AuthError(
        "Only organization account actors are allowed to promote workflow versions",
      );
    }

    const models = await getVersionOrThrow(data.versionId, environments);

    const sourceWorkflow = models.workflow;
    const sourceWorkflowVersion = models.workflowVersion;

    const sourceEnvironment = environments.find(
      (env) => env.id === sourceWorkflow.environment_id,
    );
    if (!sourceEnvironment) {
      throw new NotFoundError("workflow version");
    }

    const targetEnvironmentType =
      nextPromotionTargetByEnvironment[sourceEnvironment.type];
    if (!targetEnvironmentType) {
      throw new InvalidOperationError("Cannot promote this workflow version");
    }

    const targetEnvironment = environments.find(
      (env) => env.type === targetEnvironmentType,
    );
    if (!targetEnvironment) {
      throw new NotFoundError("Target environment not found");
    }

    const baseWorkflowId = sourceWorkflow.base_workflow_id ?? sourceWorkflow.id;

    return await db.transaction().execute(async (transaction) => {
      let targetWorkflow =
        await workflowRepository.findByBaseWorkflowIdAndEnvironmentId(
          baseWorkflowId,
          targetEnvironment.id,
        );

      if (!targetWorkflow) {
        targetWorkflow = await workflowRepository.insert(
          {
            name: sourceWorkflow.name,
            description: sourceWorkflow.description,
            environment_id: targetEnvironment.id,
            base_workflow_id: baseWorkflowId,
            created_by: actor.id,
            modified_by: actor.id,
          },
          transaction,
        );
      }

      const sourceNodes = await nodeService.getByWorkflowVersion(
        sourceWorkflowVersion,
        transaction,
      );
      const sourceEdges = await edgeService.getByNodesWithTransaction(
        sourceNodes,
        transaction,
      );

      const result = await workflowVersionService.createNew(
        {
          workflowId: targetWorkflow.id,
          description: sourceWorkflowVersion.description,
          nodes: sourceNodes.map((node) =>
            nodeSchemaService.getNodeSchema(node),
          ),
          edges: sourceEdges.map((edge) =>
            edgeService.toEdgeSchema(edge, sourceNodes),
          ),
        },
        actor,
        environments,
        transaction,
      );

      return converterUtils.parseOrThrow(WorkflowVersionPromoteResponseSchema, {
        workflowId: targetWorkflow.id,
        versionId: result.workflowVersion.id,
        sourceEnvironment: sourceEnvironment.type,
        targetEnvironment: targetEnvironment.type,
      });
    });
  },
};
