import type { Transaction } from "kysely";
import type { DB } from "../../types/database.js";
import type { NodeModel } from "../../types/models.js";
import { BaseExecutor } from "./BaseExecutor.js";
import { StartNodeConfigurationSchema } from "../../schemas/node.schema.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { FeelDataType, TaskStatuses } from "../../types/enums.js";
import { edgeService } from "../../services/edge.services.js";
import type {
  ContextVariables,
  ExecutorResult,
  FetchableSettings,
  UrlSettings,
} from "../../types/engine.js";

export class StartNodeExecutor extends BaseExecutor {
  async execute(
    node: NodeModel,
    inputVariables: ContextVariables,
    transaction?: Transaction<DB>,
  ): Promise<ExecutorResult> {
    const parsed = StartNodeConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) {
      throw new DataIntegrityError(
        `Start node configuration is invalid in node id=${node.id}`,
      );
    }

    const configuration = parsed.data;
    const inputJson = inputVariables.constants;

    let constants: Record<string, unknown> = {};
    let fetchables: Record<string, FetchableSettings> = {};
    let urls: Record<string, UrlSettings> = {};

    const outputVariables: ContextVariables = { constants, fetchables, urls };

    configuration.inputDataMap.forEach((dataMap) => {
      if (dataMap.fetchableId) {
        const fetchable = configuration.fetchables.find(
          (fetchable) => fetchable.id === dataMap.fetchableId,
        );

        if (!fetchable) {
          throw new DataIntegrityError(
            `Start node with id=${node.id} does not have referenced fetchable of id=${dataMap.fetchableId} `,
          );
        }

        fetchables[dataMap.contextVariableName] = {
          urlId: fetchable.id,
          jsonPath: dataMap.jsonPath,
          dataType: dataMap.dataType,
        };

        const headers =
          fetchable.headers?.reduce(
            (acc, { key, valueExpression }) => {
              acc[key] = valueExpression;
              return acc;
            },
            {} as Record<string, string>,
          ) ?? {};

        urls[fetchable.id] = {
          urlExpression: fetchable.urlExpression,
          headers: headers,
        };
      }

      const value = inputJson[dataMap.jsonPath];
      if (value === undefined) {
        return {
          status: TaskStatuses.FAILED,
          outputVariables,
          error: `"${dataMap.jsonPath}" is missing`,
        };
      }

      switch (dataMap.dataType) {
        case FeelDataType.LIST:
          if (!Array.isArray(value)) {
            return {
              status: TaskStatuses.FAILED,
              outputVariables,
              error: `"${dataMap.jsonPath}" must be an array`,
            };
          }
          break;

        case FeelDataType.NULL:
          if (value !== null) {
            return {
              status: TaskStatuses.FAILED,
              outputVariables,
              error: `"${dataMap.jsonPath}" must be null`,
            };
          }
          break;

        case FeelDataType.OBJECT:
          if (
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
          ) {
            return {
              status: TaskStatuses.FAILED,
              outputVariables,
              error: `"${dataMap.jsonPath}" must be an object`,
            };
          }
          break;

        default:
          if (typeof value !== dataMap.dataType) {
            return {
              status: TaskStatuses.FAILED,
              outputVariables,
              error: `"${dataMap.jsonPath}" must be of type ${dataMap.dataType}`,
            };
          }
      }

      constants[dataMap.contextVariableName] = value;
    });

    const [nextNode] = await edgeService.getNextNodeIdsBySourceNodeId(node.id);

    return {
      status: TaskStatuses.COMPLETED,
      outputVariables,
      nextNodeId: nextNode ?? null,
    };
  }
}
