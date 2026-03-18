import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { DecisionNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";

export class DecisionNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = DecisionNodeConfigurationSchema.safeParse(
      node.configuration,
    );
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Decision node configuration is invalid node id=${node.id}`,
      );
    }

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: {},
      nextNodeId: null
    };
  }
}
