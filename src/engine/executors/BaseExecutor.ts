import type { NodeModel } from "../../types/models.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";

export abstract class BaseExecutor {
  abstract execute(
    node: NodeModel,
    inputVariables: ContextVariables,
  ): Promise<ExecutorResult>;
}
