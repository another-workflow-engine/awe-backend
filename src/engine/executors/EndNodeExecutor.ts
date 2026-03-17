import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { EndNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import { buildFeelContext } from "../../utils/contextResolver.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";

export class EndNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = EndNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `End node configuration is invalid node id=${node.id}`,
      );
    }
    const configuration = parsed.data;
    let outputVariables: Record<string, unknown> = {};

    const feelContext = await buildFeelContext(inputVariables);

    configuration.resultMap.forEach((rm) => {
      const result = evaluate(rm.valueExpression, feelContext);
      if (result.warnings.length > 0) {
        throw new DataIntegrityError(
          `FEEL evaluation failed for expression "${rm.valueExpression}"`,
        );
      }

      outputVariables[rm.contextVariable.name] = result.value;
    });

    if (configuration.message) {
      outputVariables.message = configuration.message;
    }

    return {
      status: configuration.success
        ? TaskStatuses.COMPLETED
        : TaskStatuses.FAILED,
      outputVariables,
      nextNodeId: null,
    };
  }
}
