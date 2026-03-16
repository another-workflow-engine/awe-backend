import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { InstanceModel, NodeModel } from "../../types/models.js";
import type { WorkflowContext, ExecutorResult } from "../types.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { EndNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import { buildFeelContext } from "../../utils/contextResolver.js";

export class EndNodeExecutor extends BaseExecutor {
  async execute(
    _instance: InstanceModel,
    node: NodeModel,
    context: WorkflowContext,
    _transaction: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = EndNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.data) {
      throw new DataIntegrityError(
        `End node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;
    const feelContext = await buildFeelContext(context);
    const outputVariables: Record<string, unknown> = {};

    for (const mapping of configuration.resultMap) {
      const result = evaluate(mapping.valueExpression, feelContext);
      if (result.warnings.length > 0) {
        return {
          status: TaskStatuses.FAILED,
          outputVariables,
          error: `FEEL evaluation failed for expression "${mapping.valueExpression}"`,
        };
      }

      if (mapping.validationExpression) {
        const validation = evaluate(mapping.validationExpression, {
          ...feelContext,
          value: result.value,
        });
        if (validation.value !== true) {
          return {
            status: TaskStatuses.FAILED,
            outputVariables,
            error: `Validation failed for expression "${mapping.validationExpression}"`,
          };
        }
      }

      outputVariables[mapping.contextVariable.name] = result.value;
    }

    if (configuration.message) {
      outputVariables.message = configuration.message;
    }

    return {
      status: TaskStatuses.FAILED,
      outputVariables,
    };
  }
}
