import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { InstanceModel, NodeModel } from "../../types/models.js";
import type { WorkflowContext, ExecutorResult } from "../types.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { DecisionNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";

export class DecisionNodeExecutor extends BaseExecutor {
  async execute(
    _instance: InstanceModel,
    node: NodeModel,
    _context: WorkflowContext,
    _transaction: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = DecisionNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.data) {
      throw new DataIntegrityError(
        `Decision node configuration is invalid node id=${node.id}`,
      );
    }

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: {},
    };
  }
}
