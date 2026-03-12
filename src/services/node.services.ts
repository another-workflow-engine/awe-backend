import type { Transaction } from "kysely";
import type {
  ActorModel,
  NodeModel,
  WorkflowVersionModel,
} from "../types/models.js";
import type {
  Node,
  StartNodeConfiguration,
  UserNodeConfiguration,
  ServiceNodeConfiguration,
  ScriptNodeConfiguration,
  EndNodeConfiguration,
  DecisionNodeConfiguration,
} from "../types/workflow.js";
import type { DB } from "../types/database.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { NodeTypes } from "../types/enums.js";

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
          ? null
          : node.configuration.maxAttempts;

      return {
        client_id: node.id,
        configuration: JSON.stringify(node.configuration),
        created_by: actor.id,
        description: node.description ?? null,
        is_deleted: false,
        max_attempts: maxAttempts ?? 1,
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
      type: node.type,
      configuration: node.configuration,
    };

    switch (node.type) {
      case NodeTypes.START:
        return {
          ...base,
          type: NodeTypes.START,
          configuration: node.configuration as StartNodeConfiguration,
        };

      case NodeTypes.USER:
        return {
          ...base,
          type: NodeTypes.USER,
          configuration: node.configuration as UserNodeConfiguration,
        };

      case NodeTypes.SERVICE:
        return {
          ...base,
          type: NodeTypes.SERVICE,
          configuration: node.configuration as ServiceNodeConfiguration,
        };

      case NodeTypes.SCRIPT:
        return {
          ...base,
          type: NodeTypes.SCRIPT,
          configuration: node.configuration as ScriptNodeConfiguration,
        };

      case NodeTypes.DECISION:
        return {
          ...base,
          type: NodeTypes.DECISION,
          configuration: node.configuration as DecisionNodeConfiguration,
        };

      case NodeTypes.END:
        return {
          ...base,
          type: NodeTypes.END,
          configuration: node.configuration as EndNodeConfiguration,
        };
    }
  },

  getByWorkflowVersion: async (
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ): Promise<NodeModel[]> => {
    return await nodeRepository.findByWorkflowVersionId(workflowVersion.id, transaction);
  },

  deleteByWorkflowVersion: async (
    workflowVersion: WorkflowVersionModel,
    transaction?: Transaction<DB>,
  ): Promise<void> => {
    await nodeRepository.deleteByWorkflowVersionId(workflowVersion.id, transaction);
  },
};
