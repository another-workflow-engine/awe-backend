import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ScriptNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { buildFeelContext } from "../../utils/contextResolver.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";
import { JDoodleService } from "../../services/jdoodle.service.js";

export class ScriptNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = ScriptNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Script node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const currentContext = await buildFeelContext(inputVariables);

    const parameters = configuration.parameterMap.map(
      (parameter) => evaluate(parameter.valueExpression, currentContext).value,
    );

    let parsedOutput;

    try {
      const response = await JDoodleService.executeScript(
        configuration.sourceCode,
        configuration.entryFunctionName,
        parameters,
      );

      parsedOutput = response.parsedOutput;

      console.log("RAW:", response.rawOutput);
      console.log("PARSED:", parsedOutput);
    } catch (error: any) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: error.message,
        nextNodeId: null,
      };
    }

    if (parsedOutput?.error) {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        error: parsedOutput.error,
        nextNodeId: null,
      };
    }

    let outputVariables: Record<string, unknown> = {};

    configuration.responseMap.forEach(({ jsonPath, contextVariable }) => {
      if (!contextVariable) return;

      outputVariables[contextVariable.name] =
        typeof parsedOutput === "object"
          ? parsedOutput?.[jsonPath]
          : parsedOutput;
    });

    const [nextNode] = await edgeService.getNextNodeIdsBySourceNodeId(
      node.id,
      transaction,
    );

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables,
      nextNodeId: nextNode ?? null,
    };
  }
}
