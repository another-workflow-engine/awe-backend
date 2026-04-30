import type {
  ActorModel,
  DbTransaction,
  NodeModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type { Node, NodeInputSchema } from "../types/workflow.js";
import {
  nodeRepository,
  type NewNode,
} from "../repositories/node.repository.js";
import { NodeTypes } from "../types/enums.js";
import { nodeSchemaService } from "./nodeSchema.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";

export const nodeService = {
  createMany: async (
    data: Node[],
    actor: ActorModel,
    workflowVersion: WorkflowVersionModel,
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    if (data.length === 0) {
      return [];
    }

    const startNode = data.find((node) => node.type === NodeTypes.START);

    const fetchablesMap: Record<string, NodeInputSchema> = startNode
      ? nodeSchemaService.getFetchablesMap(
          startNode.configuration.inputDataMap,
          startNode.configuration.fetchables,
        )
      : {};

    const nodes: NewNode[] = data.map((node) => {
      const maxAttempts =
        node.type === NodeTypes.START ||
        node.type === NodeTypes.END ||
        node.type === NodeTypes.DECISION
          ? 1
          : node.configuration.maxAttempts;

      const { inputSchema, outputSchema } =
        nodeSchemaService.getInputOutputSchemas(node, fetchablesMap);

      return {
        client_id: node.id,
        configuration: converterUtils.objectToJsonValue(node.configuration),
        created_by: actor.id,
        description: node.description ?? null,
        is_deleted: false,
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
    transaction?: DbTransaction,
  ): Promise<NodeModel[]> => {
    return await nodeRepository.findByWorkflowVersionId(
      workflowVersion.id,
      transaction,
    );
  },

  deleteByWorkflowVersion: async (
    workflowVersion: WorkflowVersionModel,
    transaction?: DbTransaction,
  ): Promise<void> => {
    await nodeRepository.deleteByWorkflowVersionId(
      workflowVersion.id,
      transaction,
    );
  },

  getByStartNodeByWorkflowVersionId: async (
    workflowVersionId: string,
    transaction?: DbTransaction,
  ) => {
    const nodes = await nodeRepository.findByWorkflowVersionIdAndNodeType(
      workflowVersionId,
      NodeTypes.START,
      transaction,
    );

    return nodes[0];
  },

  getById: async (id: string, transaction?: DbTransaction) => {
    return await nodeRepository.findById(id, transaction);
  },

  getByIdOrThrow: async (nodeId: string): Promise<NodeModel> => {
    const node = await nodeRepository.findById(nodeId);
    if (!node) {
      throw new DataIntegrityError(`Node id=${nodeId} not found`);
    }

    return node;
  },
};
