import { Executor } from "./Executor.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { FeelDataType, NodeTypes } from "../../types/enums.js";
import type { ExecutorResult, EvaluatedContext } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";
import { contextUtils } from "../../utils/context.utils.js";
import type {
  DecisionNodeDefaultRule,
  DecisionNodeRule,
} from "../../types/workflow.js";

export class DecisionNodeExecutor extends Executor<typeof NodeTypes.DECISION> {
  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    let matchedRule: DecisionNodeRule | DecisionNodeDefaultRule | undefined;

    matchedRule = this.configuration.rules.find((rule) =>
      contextUtils.getFeelEvaluatedValue(
        rule.conditionExpression,
        evaluatedContext,
        FeelDataType.BOOLEAN,
      ),
    );

    if (!matchedRule) {
      matchedRule = this.configuration.defaultRule;
    }

    const edges = await edgeService.getBySourceNodeId(this.node.id);
    if (edges.length === 0) {
      throw new DataIntegrityError(
        `Decision node id=${this.node.id} has no outgoing edges`,
      );
    }

    const matchedEdge = edges.find((edge) => edge.rule_id === matchedRule.id);
    if (!matchedEdge) {
      throw new DataIntegrityError(
        `No edge found for rule id=${matchedRule.id} on decision node id=${this.node.id}`,
      );
    }

    if (!matchedEdge.destination_node_id) {
      throw new DataIntegrityError(
        `Matched edge id=${matchedEdge.id} has no destination node`,
      );
    }

    return await this.getCompletedResult(matchedEdge.destination_node_id);
  }
}
