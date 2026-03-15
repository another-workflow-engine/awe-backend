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
import { fetchService } from "../../services/fetch.service.js";

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

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
    const urls: Record<string, string> = {};

    configuration.inputDataMap.forEach((dataMap) => {
      if (dataMap.fetchableId) {
        fetchables[dataMap.contextVariableName] = {
          urlId: dataMap.fetchableId,
          jsonPath: dataMap.jsonPath,
        };
        return;
      }
      constants[dataMap.contextVariableName] =
        instanceInputVariables[dataMap.jsonPath];
    });

    configuration.fetchables.forEach((f) => {
      const result = evaluate(f.urlExpression, constants);
      if (result.warnings.length > 0 || typeof result.value !== "string") {
        throw new DataIntegrityError(
          `Invalid FEEL expression in start node fetchables nodeId=${node.id}`,
        );
      }
      urls[f.id] = result.value;
    });

    const fetchedResponses: Record<string, unknown> = {};
    for (const [varName, { urlId, jsonPath }] of Object.entries(fetchables)) {
      const url = urls[urlId];
      if (!url) continue;
      if (!(urlId in fetchedResponses)) {
        const fetchableConfig = configuration.fetchables.find(
          (f) => f.id === urlId,
        );
        const headers: Record<string, string> = {};
        for (const h of fetchableConfig?.headers ?? []) {
          const headerVal = evaluate(h.valueExpression, constants);
          if (typeof headerVal.value === "string") {
            headers[h.key] = headerVal.value;
          }
        }
        fetchedResponses[urlId] = await fetchService.get(url, headers);
      }
      constants[varName] = getByPath(fetchedResponses[urlId], jsonPath);
    }

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables: { constants, fetchables, urls },
    };
  }
}
