import type { Transaction } from "kysely";
import type {
  ActorModel,
  NodeModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type { Node } from "../types/workflow.js";
import type { DB } from "../types/database.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { NodeTypes } from "../types/enums.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import {
  DecisionNodeConfigurationSchema,
  EndNodeConfigurationSchema,
  ScriptNodeConfigurationSchema,
  ServiceNodeConfigurationSchema,
  StartNodeConfigurationSchema,
  UserNodeConfigurationSchema,
} from "../schemas/node.schema.js";

export const nodeService = {
  createMany: async (
    data: Node[],
    actor: ActorModel,
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ) => {
    const nodes = data.map((node) => {
      const maxAttempts =
        node.type === NodeTypes.START ||
        node.type === NodeTypes.END ||
        node.type === NodeTypes.DECISION
          ? 1
          : node.configuration.maxAttempts;

      return {
        client_id: node.id,
        configuration: JSON.stringify(node.configuration),
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
      };
    });

    return await nodeRepository.insertMany(nodes, transaction);
  },

  toNodeSchema: (node: NodeModel): Node => {
    const base = {
      id: node.client_id,
      label: node.name,
      description: node.description,
      position:
        node.x_coordinate && node.y_coordinate
          ? { x: node.x_coordinate, y: node.y_coordinate }
          : null,
    };

    switch (node.type) {
      case NodeTypes.START:
        return {
          ...base,
          type: NodeTypes.START,
          configuration: StartNodeConfigurationSchema.parse(node.configuration),
        };

      case NodeTypes.USER:
        return {
          ...base,
          type: NodeTypes.USER,
          configuration: UserNodeConfigurationSchema.parse(node.configuration),
        };

      case NodeTypes.SERVICE:
        return {
          ...base,
          type: NodeTypes.SERVICE,
          configuration: ServiceNodeConfigurationSchema.parse(
            node.configuration,
          ),
        };

      case NodeTypes.SCRIPT:
        return {
          ...base,
          type: NodeTypes.SCRIPT,
          configuration: ScriptNodeConfigurationSchema.parse(
            node.configuration,
          ),
        };

      case NodeTypes.DECISION:
        return {
          ...base,
          type: NodeTypes.DECISION,
          configuration: DecisionNodeConfigurationSchema.parse(
            node.configuration,
          ),
        };

      case NodeTypes.END:
        return {
          ...base,
          type: NodeTypes.END,
          configuration: EndNodeConfigurationSchema.parse(node.configuration),
        };
    }
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

  getById: async (
    nodeId: string,
    transaction?: Transaction<DB>,
  ): Promise<NodeModel | null> => {
    const node = await nodeRepository.findById(nodeId, transaction);
    return node ?? null;
  },

  getByStartNodeByWorkflowVersionIdOrThrow: async (
    workflowVersionId: string,
    transaction?: Transaction<DB>,
  ) => {
    const nodes = await nodeRepository.findByWorkflowVersionIdAndNodeType(
      workflowVersionId,
      NodeTypes.START,
      transaction,
    );

    if (nodes.length === 0 || !nodes[0]) {
      throw new DataIntegrityError(
        `No start node for workflow version id=${workflowVersionId}`,
      );
    }

    return nodes[0];
  },
};
