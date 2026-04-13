import { BaseExecutor } from "./BaseExecutor.js";
import { NodeTypes } from "../../types/enums.js";
import type { ExecutorResult, EvaluatedContext } from "../../types/engine.js";
import { contextUtils } from "../../utils/context.utils.js";

export class EndNodeExecutor extends BaseExecutor<typeof NodeTypes.END> {
  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    this.configuration.resultMap.forEach((dataMap) => {
      this.outputVariables[dataMap.variableName] =
        contextUtils.getFeelEvaluatedValue(
          dataMap.valueExpression,
          evaluatedContext,
        );
    });

    if (this.configuration.message) {
      this.outputVariables.message = this.configuration.message;
    }

    return this.getCompletedResult(null);
  }
}
