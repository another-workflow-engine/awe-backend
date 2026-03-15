import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { InstanceModel, NodeModel } from "../../types/models.js";
import type { WorkflowContext, ExecutorResult } from "../types.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { UserNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import { contextManager } from "../ContextManager.js";

export class UserTaskExecutor extends BaseExecutor {
  async execute(
    _instance: InstanceModel,
    node: NodeModel,
    context: WorkflowContext,
    _transaction: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = UserNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.data) {
      throw new DataIntegrityError(
        `User node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;
    const flatContext = contextManager.resolveForNode(context);
    const requestData: Record<string, unknown> = {};

    for (const field of configuration.requestMap) {
      const result = evaluate(field.valueExpression, flatContext);
      requestData[field.label] = result.value;
    }

    return {
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: { requestData, responseMap: configuration.responseMap },
    };
  }
}
