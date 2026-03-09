import type { Transaction } from "kysely";
import type { ActorModel, EdgeModel, NodeModel } from "../types/models.js";
import type { DecisionNodeConfiguration, Edge } from "../types/workflow.js";
import type { DB } from "../types/database.js";
import {
  edgeRepository,
  type NewEdge,
} from "../repositories/edge.repository.js";
import { NodeTypes } from "../types/enums.js";
import { AppError } from "../errors/AppError.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { nodeService } from "./node.services.js";

const findNodesByEdge = (
  nodes: NodeModel[],
  edge: Edge,
): [NodeModel, NodeModel | null] => {
  let source = null;
  let destination = null;

  for (let node of nodes) {
    if (node.client_id === edge.sourceNodeId) {
      source = node;
    }
    if (node.client_id === edge.targetNodeId) {
      destination = node;
    }

    if (source && destination) {
      break;
    }
  }

  if (!source) {
    throw new AppError("source cannot be null");
  }

  return [source, destination];
};

const findNodesByEdgeModel = (
  nodes: NodeModel[],
  edge: EdgeModel,
): [NodeModel, NodeModel | null] => {
  let source = null;
  let destination = null;

  for (let node of nodes) {
    if (node.id === edge.source_node_id) {
      source = node;
    }
    if (node.id === edge.destination_node_id) {
      destination = node;
    }

    if (source && destination) {
      break;
    }
  }

  if (!source) {
    console.log(nodes);
    console.log(edge);
    throw new DataIntegrityError("source cannot be null");
  }

  return [source, destination];
};

const getConditionExpressionForEdge = (
  sourceNode: NodeModel,
  edge: Edge,
): string | null => {
  if (sourceNode.type !== NodeTypes.DECISION) {
    return null;
  }

  const sourceNodeConfig = sourceNode.configuration;
  const decisionNode = (
    typeof sourceNodeConfig === "string"
      ? JSON.parse(sourceNodeConfig)
      : sourceNodeConfig
  ) as DecisionNodeConfiguration;

  if (edge.ruleId === decisionNode.defaultRule.id) {
    return null;
  }

  for (let rule of decisionNode.rules) {
    if (edge.ruleId === rule.id) {
      return rule.conditionExpression;
    }
  }

  return null;
};

const getRuleIdForEdge = (sourceNode: NodeModel, edge: EdgeModel) => {
  const sourceNodeSchema = nodeService.toNodeSchema(sourceNode);
  if (sourceNodeSchema.type !== NodeTypes.DECISION) {
    return null;
  }

  if (edge.condition_expression === null) {
    return sourceNodeSchema.configuration.defaultRule.id;
  }

  const rule = sourceNodeSchema.configuration.rules.find(
    (rule) => rule.conditionExpression === edge.condition_expression,
  );

  if (!rule) {
    throw new DataIntegrityError(
      "Inconsistent state. Edge condition expression not found.",
    );
  }
  return rule.id;
};

export const edgeService = {
  createMany: async (
    edges: Edge[],
    nodes: NodeModel[],
    actor: ActorModel,
    transaction?: Transaction<DB>,
  ): Promise<EdgeModel[]> => {
    const insertEdges: NewEdge[] = edges.map((edge) => {
      const [sourceNode, destinationNode] = findNodesByEdge(nodes, edge);
      let condition_expression = null;

      if (sourceNode) {
        condition_expression = getConditionExpressionForEdge(sourceNode, edge);
      }

      return {
        client_id: edge.id,
        name: edge.label ?? null,
        source_node_id: sourceNode.id,
        destination_node_id: destinationNode?.id ?? null,
        condition_expression: condition_expression,
        created_by: actor.id,
        modified_by: actor.id,
        is_deleted: false,
      };
    });

    return await edgeRepository.insertMany(insertEdges, transaction);
  },

  toEdgeSchema: (edge: EdgeModel, nodes: NodeModel[]): Edge => {
    const [sourceNode, destinationNode] = findNodesByEdgeModel(nodes, edge);

    return {
      id: edge.client_id,
      label: edge.name,
      sourceNodeId: sourceNode.client_id,
      targetNodeId: destinationNode?.client_id ?? null,
      ruleId: getRuleIdForEdge(sourceNode, edge),
    };
  },

  getByNodes: async (nodes: NodeModel[]): Promise<EdgeModel[]> => {
    if (nodes.length === 0) {
      return [];
    }

    const ids = nodes.map((node) => node.id);
    return await edgeRepository.findByNodeIds(ids);
  },
};
