import type { Transaction } from "kysely";
import type {
  ActorModel,
  NodeModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type { Node } from "../types/workflow.js";
import type { DB } from "../types/database.js";
import {
  nodeRepository,
  type NewNode,
} from "../repositories/node.repository.js";
import { NodeTypes } from "../types/enums.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { nodeSchemaService } from "./nodeSchema.service.js";
import { converterUtils } from "../utils/converter.utils.js";

export const nodeService = {
  createMany: async (
    data: Node[],
    actor: ActorModel,
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ): Promise<NodeModel[]> => {
    if (data.length === 0) {
      return [];
    }

    const nodes: NewNode[] = data.map((node) => {
      const maxAttempts =
        node.type === NodeTypes.START ||
        node.type === NodeTypes.END ||
        node.type === NodeTypes.DECISION
          ? 1
          : node.configuration.maxAttempts;

      const { inputSchema, outputSchema } =
        nodeSchemaService.getInputOutputSchemas(node);

      return {
        client_id: node.id,
        configuration: converterUtils.objectToJsonValue(node.configuration),
        created_by: actor.id,
        description: node.description ?? null,
        is_deleted: false,
        max_attempts: maxAttempts,
        modified_by: actor.id,
        name: node.label ?? null,
        type: node.type,
        workflow_version_id: workflowVersion.id,
        x_coordinate: node.position?.x ?? null,
        y_coordinate: node.position?.y ?? null,
        input_schema: converterUtils.objectToJsonValue(inputSchema),
        output_schema: converterUtils.objectToJsonValue(outputSchema),
      };
    });

    return await nodeRepository.insertMany(nodes, transaction);
  },

  getByWorkflowVersion: async (
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ): Promise<NodeModel[]> => {
    return await nodeRepository.findByWorkflowVersionId(
      workflowVersion.id,
      transaction,
    );
  },

  deleteByWorkflowVersion: async (
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await nodeRepository.deleteByWorkflowVersionId(
      workflowVersion.id,
      transaction,
    );
  },

  getByStartNodeByWorkflowVersionId: async (
    workflowVersionId: string,
    transaction?: Transaction<DB>,
  ) => {
    const nodes = await nodeRepository.findByWorkflowVersionIdAndNodeType(
      workflowVersionId,
      NodeTypes.START,
      transaction,
    );

    return nodes[0];
  },

  getById: async (id: string, transaction?: Transaction<DB>) => {
    return await nodeRepository.findById(id, transaction);
  },
};
