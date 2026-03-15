import { evaluate } from "@bpmn-io/feelin";
import type { EdgeModel, NodeModel } from "../types/models.js";
import type { WorkflowContext } from "./types.js";
import { NodeTypes } from "../types/enums.js";
import { contextManager } from "./ContextManager.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";

export const edgeResolver = {
  
  resolveNextNodeIds(
    completedNodeId: string,
    context: WorkflowContext,
    edges: EdgeModel[],
    nodes: NodeModel[],
  ): string[] {
    const completedNode = nodes.find((n) => n.id === completedNodeId);
    const outgoing = edges.filter(
      (e) =>
        e.source_node_id === completedNodeId && e.destination_node_id !== null,
    );

    if (outgoing.length === 0) return [];

    if (completedNode?.type === NodeTypes.DECISION) {
      return evaluateDecisionEdges(outgoing, context);
    }

    return outgoing
      .map((e) => e.destination_node_id)
      .filter((id): id is string => id !== null);
  },
};

function evaluateDecisionEdges(
  outgoing: EdgeModel[],
  context: WorkflowContext,
): string[] {
  const flatContext = contextManager.resolveForNode(context);
  const conditional = outgoing.filter((e) => e.condition_expression !== null);
  const defaultEdge = outgoing.find((e) => e.condition_expression === null);

  const matched = conditional
    .filter((e) => {
      const result = evaluate(e.condition_expression!, flatContext);
      return result.value === true;
    })
    .map((e) => e.destination_node_id)
    .filter((id): id is string => id !== null);

  if (matched.length > 0) return matched;

  if (!defaultEdge?.destination_node_id) {
    throw new StateTransitionError(
      "No matching condition and no default edge on decision node",
    );
  }

  return [defaultEdge.destination_node_id];
}
