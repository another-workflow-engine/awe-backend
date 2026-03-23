import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { ServiceNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { TaskStatuses } from "../../types/enums.js";
import type { ContextVariables, ExecutorResult } from "../../types/engine.js";
import { edgeService } from "../../services/edge.services.js";
import { httpRequestService } from "../../services/httpRequest.service.js";
import { contextUtils } from "../../utils/context.utils.js";

function getByPath(data: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);

  return parts.reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, data);
}

export class ServiceNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = ServiceNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Service node configuration is invalid node id=${node.id}`,
      );
    }

    const configuration = parsed.data;

    const feelContext = await contextUtils.buildFeelContext(inputVariables);

    const urlResult = evaluate(configuration.urlExpression, feelContext);
    if (
      urlResult.warnings.length !== 0 ||
      typeof urlResult.value !== "string"
    ) {
      throw new DataIntegrityError(
        `Invalid URL expression "${configuration.urlExpression}" in service node id=${node.id}`,
      );
    }
    const url = urlResult.value;

    const headers: Record<string, string> = {};
    if (configuration.headers) {
      for (const { key, valueExpression } of configuration.headers) {
        const headerResult = evaluate(valueExpression, feelContext);
        if (
          headerResult.warnings.length !== 0 ||
          typeof headerResult.value !== "string"
        ) {
          throw new DataIntegrityError(
            `Invalid header expression "${valueExpression}" for key "${key}" in service node id=${node.id}`,
          );
        }
        headers[key] = headerResult.value;
      }
    }

    let requestBody: Record<string, unknown> | undefined = undefined;
    if (configuration.body && configuration.body.length > 0) {
      requestBody = {};
      for (const { jsonPath, valueExpression } of configuration.body) {
        const bodyResult = evaluate(valueExpression, feelContext);
        if (bodyResult.warnings.length !== 0) {
          throw new DataIntegrityError(
            `Invalid body expression "${valueExpression}" for path "${jsonPath}" in service node id=${node.id}`,
          );
        }
        const pathParts = jsonPath.split(".").filter(Boolean);
        let current: Record<string, unknown> = requestBody;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!part) continue;
          if (!(part in current)) {
            current[part] = {};
          }
          const nextValue = current[part];
          if (
            typeof nextValue === "object" &&
            nextValue !== null &&
            !Array.isArray(nextValue)
          ) {
            current = nextValue as Record<string, unknown>;
          }
        }
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart) {
          current[lastPart] = bodyResult.value;
        }
      }
    }

    let responseBody: unknown;
    try {
      switch (configuration.method) {
        case "GET":
          responseBody = await httpRequestService.get(url, headers);
          break;
        case "POST":
          responseBody = await httpRequestService.post(
            url,
            requestBody ?? {},
            headers,
          );
          break;
        case "PUT":
          responseBody = await httpRequestService.put(
            url,
            requestBody ?? {},
            headers,
          );
          break;
        case "PATCH":
          responseBody = await httpRequestService.patch(
            url,
            requestBody ?? {},
            headers,
          );
          break;
        case "DELETE":
          responseBody = await httpRequestService.delete(url, headers);
          break;
        default:
          throw new DataIntegrityError(
            `Unsupported HTTP method "${configuration.method}" in service node id=${node.id}`,
          );
      }
    } catch (error) {
      const [nextNode] = await edgeService.getDestinationNodeIdsBySourceNodeId(
        node.id,
        transaction,
      );

      return {
        status: TaskStatuses.COMPLETED,
        outputVariables: {},
        nextNodeId: nextNode ?? null,
      };
    }

    const outputVariables: Record<string, unknown> = {};
    for (const responseItem of configuration.responseMap) {
      const value = getByPath(responseBody, responseItem.jsonPath);
      outputVariables[responseItem.contextVariableName] = value;
    }

    const [nextNode] = await edgeService.getDestinationNodeIdsBySourceNodeId(
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
