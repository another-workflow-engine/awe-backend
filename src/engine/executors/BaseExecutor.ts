import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";

export abstract class BaseExecutor {
  abstract execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult>;
}
