import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { NodeTypes } from "../types/enums.js";
import type { NodeModel, EdgeModel } from "../types/models.js";

export type ValidationError = {
  code: number;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export enum ValidationErrorCode {
  START_NODE_MISSING_OR_MULTIPLE,
  END_NODE_MISSING,

  EDGE_TARGET_NODE_MISSING,
  EDGE_SOURCE_AND_TARGET_EQUAL,
  EDGE_SOURCE_NODE_IS_END,
  EDGE_TARGET_NODE_IS_START,
}

export const workflowValidatorService = {
  validate: (nodes: NodeModel[], edges: EdgeModel[]): ValidationResult => {
    const errors = [
      ...workflowValidatorService.validateAllNodes(nodes, edges),
      ...workflowValidatorService.validateAllEdges(nodes, edges),
    ];

    return {
      valid: errors.length == 0,
      errors,
    };
  },

  validateAllNodes: (
    nodes: NodeModel[],
    edges: EdgeModel[],
  ): ValidationError[] => {
    const errors: ValidationError[] = [];
    const nodeCounts = { start: 0, end: 0 };

    for (let node of nodes) {
      let res = null;

      switch (node.type) {
        case NodeTypes.START:
          res = workflowValidatorService.validateStartNode(node);
          nodeCounts.start++;

        case NodeTypes.END:
          res = workflowValidatorService.validateEndNode(node);
          nodeCounts.end++;
      }

      if (res) {
        errors.concat(res);
      }
    }

    if (nodeCounts.start !== 1) {
      errors.push({
        code: ValidationErrorCode.START_NODE_MISSING_OR_MULTIPLE,
        message: "Workflow must contain exactly one start node",
      });
    }

    if (nodeCounts.end === 0) {
      errors.push({
        code: ValidationErrorCode.END_NODE_MISSING,
        message: "Workflow must contain at least one end node",
      });
    }

    return errors;
  },

  validateStartNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    // validate start node
    return errors;
  },

  validateEndNode: (node: NodeModel): ValidationError[] => {
    const errors: ValidationError[] = [];
    // validate end node
    return errors;
  },

  validateAllEdges: (nodes: NodeModel[], edges: EdgeModel[]) => {
    const errors: ValidationError[] = [];

    const nodeMap: Map<string, NodeModel> = new Map(
      nodes.map((node) => [node.id, node]),
    );

    for (let edge of edges) {
      if (!edge.destination_node_id) {
        errors.push({
          code: ValidationErrorCode.EDGE_TARGET_NODE_MISSING,
          message: "Every edge must have a target node",
          edgeId: edge.client_id,
        });
      } else {
        const destinationNode = nodeMap.get(edge.destination_node_id);
        if (!destinationNode) {
          throw new DataIntegrityError(
            `Target node id=${edge.destination_node_id} of edge id=${edge.id} does not exist`,
          );
        }

        if (destinationNode.type === NodeTypes.START) {
          errors.push({
            code: ValidationErrorCode.EDGE_TARGET_NODE_IS_START,
            message: "Edge cannot have the target as the start node",
            edgeId: edge.client_id,
            nodeId: destinationNode.client_id,
          });
        }
      }

      if (edge.source_node_id === edge.destination_node_id) {
        errors.push({
          code: ValidationErrorCode.EDGE_SOURCE_AND_TARGET_EQUAL,
          message: "Source and target nodes cannot be the same",
          edgeId: edge.client_id,
        });
      }

      const sourceNode = nodeMap.get(edge.source_node_id);
      if (!sourceNode) {
        throw new DataIntegrityError(
          `Source node id=${edge.source_node_id} of edge id=${edge.id} does not exist`,
        );
      }

      if (sourceNode.type === NodeTypes.END) {
        errors.push({
          code: ValidationErrorCode.EDGE_SOURCE_NODE_IS_END,
          message: "Edge cannot have a source as an end node",
          edgeId: edge.client_id,
          nodeId: sourceNode.client_id,
        });
      }
    }

    return errors;
  },
};
