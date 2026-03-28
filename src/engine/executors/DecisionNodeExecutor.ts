import type { NodeModel, EdgeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { DecisionNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { StateTransitionError } from "../../errors/StateTransitionError.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { evaluate } from "@bpmn-io/feelin";
import { edgeService } from "../../services/edge.services.js";
import { contextUtils } from "../../utils/context.utils.js";

const normalizeExpression = (expr: string): string => {
  return expr.replace(/\s+/g, " ").trim();
};

export class DecisionNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
  ): Promise<ExecutorResult> {
    const parsed = DecisionNodeConfigurationSchema.safeParse(
      node.configuration,
    );
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Decision node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const edges = await edgeService.getBySourceNodeId(node.id);

    if (edges.length === 0) {
      throw new StateTransitionError(
        `Decision node id=${node.id} has no outgoing edges`,
      );
    }

    const feelContext = await contextUtils.evaluateContext(inputVariables);

    let matchedEdge: EdgeModel | null = null;

    for (const rule of configuration.rules) {
      const normalizedRuleExpr = normalizeExpression(rule.conditionExpression);

      const edge = edges.find(
        (e) =>
          e.condition_expression &&
          normalizeExpression(e.condition_expression) === normalizedRuleExpr,
      );

      if (!edge) {
        throw new DataIntegrityError(
          `No edge found for rule id=${rule.id} with condition="${rule.conditionExpression}" on decision node id=${node.id}`,
        );
      }

      const evaluationResult = evaluate(rule.conditionExpression, feelContext);

      if (evaluationResult.warnings && evaluationResult.warnings.length > 0) {
        throw new StateTransitionError(
          `FEEL expression evaluation failed for rule id=${rule.id}: ${evaluationResult.warnings.join(", ")}`,
        );
      }

      if (
        evaluationResult.value === null ||
        evaluationResult.value === undefined
      ) {
        continue;
      }

      if (evaluationResult.value === true) {
        matchedEdge = edge;
        break;
      }
    }

    if (!matchedEdge) {
      const defaultEdge = edges.find((e) => e.condition_expression === null);

      if (!defaultEdge) {
        throw new StateTransitionError(
          `No condition matched and no default edge exists on decision node id=${node.id}`,
        );
      }

      matchedEdge = defaultEdge;
    }

    if (!matchedEdge.destination_node_id) {
      throw new DataIntegrityError(
        `Matched edge id=${matchedEdge.id} has no destination node`,
      );
    }

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: {},
      nextNodeId: matchedEdge.destination_node_id,
    };
  }
}
