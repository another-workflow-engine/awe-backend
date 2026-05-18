import { workflowVersionRepository } from "../../repositories/workflowVersion.repository.js";
import { workflowRepository } from "../../repositories/workflow.repository.js";
import {
  EnvironmentTypes,
  NodeTypes,
  WorkflowVersionStatuses,
} from "../../types/enums.js";
import type {
  ActorModel,
  DbTransaction,
  EdgeModel,
  EnvironmentModel,
  NodeModel,
  OrganizationModel,
} from "../../types/models.js";
import { edgeService } from "../edge.services.js";
import { nodeService } from "../node.services.js";
import { StateTransitionError } from "../../errors/StateTransitionError.js";
import { workflowValidatorService } from "./workflowValidator.service.js";
import { nodeSchemaService } from "../nodeSchema.service.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import type {
  Edge,
  Node,
  StartNodeConfiguration,
} from "../../types/workflow.js";
import { converterUtils } from "../../utils/converter.utils.js";
import { coerce } from "semver";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { openTransaction } from "../../utils/database.utils.js";
import { paginationUtils } from "../../utils/pagination.utils.js";
import { environmentUtils } from "../../utils/environment.utils.js";
import type {
  WorkflowDraftDetail,
  ValidationResult,
  StartVariable,
  WorkflowDraftMeta,
} from "../../types/workflowVersion.js";
import type {
  CreateDraftInput,
  DetailDraftInput,
  ListDraftInput,
  PublishDraftInput,
  UpdateDraftInput,
} from "../../schemas/workflowDraft.schema.js";
import { nodeRepository } from "../../repositories/node.repository.js";
import { StartNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { workflowDeploymentRepository } from "../../repositories/workflowDeployment.repository.js";

async function createNodesEdgesAndValidate(params: {
  nodes: Node[];
  edges: Edge[];
  actor: ActorModel;
  draftId: string;
  transaction: DbTransaction;
}): Promise<ValidationResult> {
  const nodeModels = await nodeService.createMany(
    params.nodes,
    params.actor,
    params.draftId,
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

function getStartVariables(
  startConfig: StartNodeConfiguration,
): StartVariable[] {
  const startVariables: StartVariable[] = [];

  startConfig.inputDataMap.forEach((data) => {
    if (!data.fetchableId) {
      startVariables.push({
        jsonPath: data.jsonPath,
        dataType: data.dataType,
        required: data.required !== false,
        ...(data.required === false ? { defaultValue: data.defaultValue } : {}),
      });
    }
  });

  return startVariables;
}

export const workflowDraftService = {
  listPaginated: async (
    data: ListDraftInput,
    organization: OrganizationModel,
  ) => {
    const { items, total } = await workflowVersionRepository.findPaginated({
      workflowId: data.workflowId,
      limit: data.limit,
      offset: paginationUtils.getOffset(data.page, data.limit),
      organizationId: organization.id,
      statuses: [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
    });

    const pagination = paginationUtils.getPaginationResponse(
      total,
      data.page,
      data.limit,
    );

    return {
      drafts: items,
      pagination,
    };
  },

  createNew: async (
    data: CreateDraftInput,
    actor: ActorModel,
  ): Promise<WorkflowDraftMeta> => {
    const workflow = await workflowRepository.findById(data.workflowId);
    if (!workflow) {
      throw new NotFoundError("Workflow");
    }

    const { workflowVersion, result } = await openTransaction(
      async (transaction) => {
        let workflowVersion = await workflowVersionRepository.insert(
          {
            description: data.description ?? null,
            created_by: actor.id,
            modified_by: actor.id,
            status: WorkflowVersionStatuses.DRAFT,
            workflow_id: data.workflowId,
          },
          transaction,
        );

        const result = await createNodesEdgesAndValidate({
          nodes: data.definition.nodes,
          edges: data.definition.edges,
          draftId: workflowVersion.id,
          actor,
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
        return { workflowVersion, result };
      },
    );

    const startNode = data.definition.nodes.find(
      (node) => node.type === NodeTypes.START,
    );

    return {
      id: workflowVersion.id,
      workflowId: workflowVersion.workflow_id,

      description: workflowVersion.description,
      status: workflowVersion.status,
      version: workflowVersion.version,
      environment: EnvironmentTypes.DEVELOPMENT,

      startVariables: startNode
        ? getStartVariables(startNode.configuration)
        : [],

      createdAt: workflowVersion.modified_on,
      createdBy: actor.type,

      modifiedAt: workflowVersion.modified_on,
      modifiedBy: actor.type,
      ...result,
    };
  },

  getDetail: async (
    data: DetailDraftInput,
    organization: OrganizationModel,
  ): Promise<WorkflowDraftDetail> => {
    const [draftMeta, startNodes] = await Promise.all([
      workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        data.draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      ),
      nodeRepository.findByWorkflowVersionIdAndNodeType(
        data.draftId,
        NodeTypes.START,
      ),
    ]);

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    const nodeModels: NodeModel[] = [];
    const edgeModels: EdgeModel[] = [];

    if (
      data.include === "definition" ||
      draftMeta.status !== WorkflowVersionStatuses.VALID
    ) {
      nodeModels.push(
        ...(await nodeService.getByWorkflowVersionId(draftMeta.id)),
      );
      edgeModels.push(...(await edgeService.getByNodes(nodeModels)));
    }

    const result: ValidationResult =
      draftMeta.status !== WorkflowVersionStatuses.VALID
        ? workflowValidatorService.validate(nodeModels, edgeModels)
        : { valid: true, errors: [] };

    const startConfig = startNodes[0]
      ? converterUtils.parseOrThrow(
          StartNodeConfigurationSchema,
          startNodes[0].configuration,
        )
      : null;

    const startVariables = startConfig ? getStartVariables(startConfig) : [];

    return {
      ...draftMeta,
      ...result,
      environment: EnvironmentTypes.DEVELOPMENT,
      startVariables,
      ...(data.include === "definition"
        ? {
            definition: {
              nodes: nodeModels.map((node) =>
                nodeSchemaService.getNodeSchema(node),
              ),
              edges: edgeModels.map((edge) =>
                edgeService.toEdgeSchema(edge, nodeModels),
              ),
            },
          }
        : {}),
    };
  },

  update: async (
    data: UpdateDraftInput,
    actor: ActorModel,
    organization: OrganizationModel,
  ): Promise<WorkflowDraftMeta> => {
    const draftMeta =
      await workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        data.draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      );

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    const nodeModels: NodeModel[] = await nodeService.getByWorkflowVersionId(
      draftMeta.id,
    );

    const { updatedDraft, result, startConfig } = await openTransaction(
      async (transaction) => {
        const definition = data.definition;
        let result: ValidationResult = {
          valid: true,
          errors: [],
        };
        let startConfig: StartNodeConfiguration | undefined = undefined;

        if (definition) {
          await edgeService.deleteByNodes(nodeModels, transaction);
          await nodeService.deleteByWorkflowVersionId(
            draftMeta.id,
            transaction,
          );

          const startConfigs = definition.nodes.filter(
            (n) => n.type === NodeTypes.START,
          );
          startConfig = startConfigs[0]?.configuration;

          result = await createNodesEdgesAndValidate({
            nodes: definition.nodes,
            edges: definition.edges,
            draftId: draftMeta.id,
            actor,
            transaction,
          });
        } else if (draftMeta.status !== WorkflowVersionStatuses.VALID) {
          const edgeModels: EdgeModel[] =
            await edgeService.getByNodes(nodeModels);

          result = workflowValidatorService.validate(nodeModels, edgeModels);
        }

        const status = result.valid
          ? WorkflowVersionStatuses.VALID
          : WorkflowVersionStatuses.DRAFT;

        const updatedDraft = await workflowVersionRepository.updateById(
          draftMeta.id,
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

        if (!startConfig) {
          const startConfigs = nodeModels.map(
            (n) => n.type === NodeTypes.START,
          );

          if (startConfigs[0]) {
            startConfig = converterUtils.parseOrThrow(
              StartNodeConfigurationSchema,
              startConfigs[0],
            );
          }
        }

        return { updatedDraft, result, startConfig };
      },
    );

    return {
      ...draftMeta,
      ...result,

      startVariables: startConfig ? getStartVariables(startConfig) : [],
      environment: EnvironmentTypes.DEVELOPMENT,

      description: updatedDraft.description,
      status: updatedDraft.status,

      modifiedAt: updatedDraft.modified_on,
      modifiedBy: actor.type,
    };
  },

  validate: async (
    draftId: string,
    organization: OrganizationModel,
  ): Promise<ValidationResult> => {
    const draftMeta =
      await workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      );

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    if (draftMeta.status === WorkflowVersionStatuses.VALID) {
      return { valid: true, errors: [] };
    }

    const nodes = await nodeService.getByWorkflowVersionId(draftId);
    const edges = await edgeService.getByNodes(nodes);

    const result = workflowValidatorService.validate(nodes, edges);

    return result;
  },

  publish: async (
    data: PublishDraftInput,
    actor: ActorModel,
    organization: OrganizationModel,
    environments: EnvironmentModel[],
  ): Promise<WorkflowDraftMeta> => {
    const [draftMeta, startNodes] = await Promise.all([
      workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        data.draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      ),
      nodeRepository.findByWorkflowVersionIdAndNodeType(
        data.draftId,
        NodeTypes.START,
      ),
    ]);

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    if (draftMeta.status !== WorkflowVersionStatuses.VALID) {
      throw new StateTransitionError("Workflow draft is not valid");
    }

    const previousWorkflowVersion =
      await workflowVersionRepository.findLatestNonNullVersionByWorkflowId(
        draftMeta.workflowId,
      );

    const previousVersion = coerce(previousWorkflowVersion?.version ?? "0");
    if (!previousVersion) {
      throw new DataIntegrityError(`Invalid semver version=${previousVersion}`);
    }

    const newVersion = previousVersion.inc(data.incrementType);

    const developmentEnvironment =
      environmentUtils.getSelectedEnvironmentOrThrow(
        environments,
        EnvironmentTypes.DEVELOPMENT,
      );

    const updatedDraft = await openTransaction(async (transaction) => {
      const [updatedWorkflowVersion] = await Promise.all([
        workflowVersionRepository.updateById(
          draftMeta.id,
          {
            status: WorkflowVersionStatuses.PUBLISHED,
            major_version: newVersion.major,
            minor_version: newVersion.minor,
            patch_version: newVersion.patch,
            modified_on: new Date(),
            modified_by: actor.id,
          },
          transaction,
        ),
        workflowDeploymentRepository.insert(
          {
            environment_id: developmentEnvironment.id,
            workflow_version_id: draftMeta.id,
          },
          transaction,
        ),
      ]);

      return updatedWorkflowVersion;
    });

    const startConfig = startNodes[0]
      ? converterUtils.parseOrThrow(
          StartNodeConfigurationSchema,
          startNodes[0].configuration,
        )
      : null;

    return {
      ...draftMeta,

      valid: true,
      errors: [],

      startVariables: startConfig ? getStartVariables(startConfig) : [],
      environment: EnvironmentTypes.DEVELOPMENT,

      description: updatedDraft.description,
      status: updatedDraft.status,
      version: updatedDraft.version,

      modifiedAt: updatedDraft.modified_on,
      modifiedBy: actor.type,
    };
  },

  clone: async (
    draftId: string,
    actor: ActorModel,
    organization: OrganizationModel,
  ): Promise<WorkflowDraftMeta> => {
    const draftMeta =
      await workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      );

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    const nodes = await nodeService.getByWorkflowVersionId(draftMeta.id);
    const edges = await edgeService.getByNodes(nodes);

    return await workflowDraftService.createNew(
      {
        workflowId: draftMeta.workflowId,
        definition: {
          nodes: nodes.map((node) => nodeSchemaService.getNodeSchema(node)),
          edges: edges.map((edge) => edgeService.toEdgeSchema(edge, nodes)),
        },
      },
      actor,
    );
  },

  delete: async (
    draftId: string,
    actor: ActorModel,
    organization: OrganizationModel,
  ) => {
    const draftMeta =
      await workflowVersionRepository.findByIdAndOrganizationIdAsMeta(
        draftId,
        organization.id,
        [WorkflowVersionStatuses.DRAFT, WorkflowVersionStatuses.VALID],
      );

    if (!draftMeta) {
      throw new NotFoundError("Workflow Draft");
    }

    await openTransaction(async (transaction) => {
      const nodeModels = await nodeService.getByWorkflowVersionId(
        draftMeta.id,
        transaction,
      );

      await edgeService.deleteByNodes(nodeModels, transaction);
      await nodeService.deleteByWorkflowVersionId(draftMeta.id, transaction);

      await workflowVersionRepository.updateById(
        draftId,
        {
          is_deleted: true,
          deleted_on: new Date(),
          deleted_by: actor.id,
        },
        transaction,
      );
    });
  },
};
