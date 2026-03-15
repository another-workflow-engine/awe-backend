import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { InstanceModel, NodeModel } from "../../types/models.js";
import type { WorkflowContext, ExecutorResult } from "../types.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { StartNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import { converterUtils } from "../../utils/converter.utils.js";
import type { FetchableUrlConfig } from "../../utils/contextResolver.js";

export class StartNodeExecutor extends BaseExecutor {
  async execute(
    instance: InstanceModel,
    node: NodeModel,
    _context: WorkflowContext,
    _transaction: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = StartNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.data) {
      throw new DataIntegrityError(
        `Start node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;
    const instanceInputVariables = converterUtils.jsonValueToObject(
      instance.input_variables,
    );

    const constants: Record<string, unknown> = {};

    const fetchables: Record<string, { urlId: string; jsonPath: string }> = {};

    configuration.inputDataMap.forEach((dataMap) => {
      if (dataMap.fetchableId) {
        fetchables[dataMap.contextVariableName] = {
          urlId: dataMap.fetchableId,
          jsonPath: dataMap.jsonPath,
        };
      } else {
        constants[dataMap.contextVariableName] =
          instanceInputVariables[dataMap.jsonPath];
      }
    });

    const urls: Record<string, FetchableUrlConfig> = {};

    for (const f of configuration.fetchables) {
      const urlResult = evaluate(f.urlExpression, constants);
      if (
        urlResult.warnings.length > 0 ||
        typeof urlResult.value !== "string"
      ) {
        throw new DataIntegrityError(
          `Invalid FEEL URL expression in start node fetchables nodeId=${node.id}`,
        );
      }

      const headers: Record<string, string> = {};
      for (const h of f.headers ?? []) {
        const headerVal = evaluate(h.valueExpression, constants);
        if (typeof headerVal.value === "string") {
          headers[h.key] = headerVal.value;
        }
      }

      urls[f.id] = { url: urlResult.value, headers };
    }

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: { constants, fetchables, urls },
    };
  }
}
