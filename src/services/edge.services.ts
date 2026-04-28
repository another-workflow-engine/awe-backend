import type {
  ActorModel,
  DbTransaction,
  EdgeModel,
  NodeModel,
} from "../types/models.js";
import type { Edge } from "../types/workflow.js";
import {
  edgeRepository,
  type NewEdge,
} from "../repositories/edge.repository.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { converterUtils } from "../utils/converter.utils.js";
import { EdgeSchema } from "../schemas/node.schema.js";

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
    throw new DataIntegrityError(
      `Edge client_id=${edge.id} does not have a source node`,
    );
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
    throw new DataIntegrityError("source cannot be null");
  }

  return [source, destination];
};

export const edgeService = {
  createMany: async (
    edges: Edge[],
    nodes: NodeModel[],
    actor: ActorModel,
    transaction?: DbTransaction,
  ): Promise<EdgeModel[]> => {
    const insertEdges: NewEdge[] = edges.map((edge) => {
      const [sourceNode, destinationNode] = findNodesByEdge(nodes, edge);

      return {
        client_id: edge.id,
        name: edge.label ?? null,
        source_node_id: sourceNode.id,
        destination_node_id: destinationNode?.id ?? null,
        rule_id: edge.ruleId === undefined ? null : edge.ruleId,
        created_by: actor.id,
        modified_by: actor.id,
        is_deleted: false,
      };
    });

    return await edgeRepository.insertMany(insertEdges, transaction);
  },

  toEdgeSchema: (edge: EdgeModel, nodes: NodeModel[]): Edge => {
    const [sourceNode, destinationNode] = findNodesByEdgeModel(nodes, edge);

    return converterUtils.parseOrThrow(EdgeSchema, {
      id: edge.client_id,
      label: edge.name,
      sourceNodeId: sourceNode.client_id,
      targetNodeId: destinationNode?.client_id ?? null,
      ruleId: edge.rule_id,
    });
  },

  getByNodes: async (nodes: NodeModel[]): Promise<EdgeModel[]> => {
    return await edgeService.getByNodesWithTransaction(nodes);
  },

  getByNodesWithTransaction: async (
    nodes: NodeModel[],
    transaction?: DbTransaction,
  ): Promise<EdgeModel[]> => {
    if (nodes.length === 0) {
      return [];
    }

    const ids = nodes.map((node) => node.id);
    return await edgeRepository.findByNodeIds(ids, transaction);
  },

  deleteByNodes: async (
    nodes: NodeModel[],
    transaction?: DbTransaction,
  ): Promise<void> => {
    if (nodes.length === 0) return;
    const ids = nodes.map((node) => node.id);
    await edgeRepository.deleteByNodeIds(ids, transaction);
  },

  getBySourceNodeId: async (
    nodeId: string,
    transaction?: DbTransaction,
  ): Promise<EdgeModel[]> => {
    return await edgeRepository.findBySourceNodeId(nodeId, transaction);
  },

  getDestinationNodeIdsBySourceNodeId: async (
    nodeId: string,
    transaction?: DbTransaction,
  ): Promise<string[]> => {
    const edges = await edgeRepository.findBySourceNodeId(nodeId, transaction);

    return edges
      .map((edge) => edge.destination_node_id)
      .filter((id): id is string => id !== null);
  },
};
