import { db } from "../database.js";
import { workflowVersionRepository } from "../repositories/workflowVersion.repository.js";
import { WorkflowVersionStatuses } from "../types/enums.js";
import type { ActorModel, WorkflowVersionModel } from "../types/models.js";
import type { Node, Edge } from "../types/workflow.js";
import { edgeService } from "./edge.services.js";
import { nodeService } from "./node.services.js";
import { WorkflowVersionDetailRequest } from "../schemas/workflowVersion.schema.js";
import { z } from "zod";

type DetailInput = z.infer<typeof WorkflowVersionDetailRequest>;

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
};
