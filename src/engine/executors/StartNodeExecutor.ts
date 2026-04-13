import { BaseExecutor } from "./BaseExecutor.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import type {
  EvaluatedContext,
  ExecutorResult,
  FetchableSettings,
  UrlSettings,
} from "../../types/engine.js";
import { contextUtils } from "../../utils/context.utils.js";
import type { Fetchable, StartNodeDataMap } from "../../types/workflow.js";
import { NodeTypes } from "../../types/enums.js";
import { isValidFeelType } from "../../utils/feel.utils.js";

export class StartNodeExecutor extends BaseExecutor<typeof NodeTypes.START> {
  private addFetchable(
    fetchables: Record<string, FetchableSettings>,
    urls: Record<string, UrlSettings>,
    dataMap: StartNodeDataMap,
    fetchable: Fetchable,
  ): void {
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
      headers,
    };
  }

  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    const inputJson = this.inputVariables.constants;

    let constants: Record<string, unknown> = {};
    let fetchables: Record<string, FetchableSettings> = {};
    let urls: Record<string, UrlSettings> = {};

    const secrets: Record<string, string> = Object.fromEntries(
      this.configuration.secretDataMap.map((s) => [
        s.secretVariableName,
        s.secretId,
      ]),
    );

    this.outputVariables = { constants, fetchables, urls, secrets };

    for (const dataMap of this.configuration.inputDataMap) {
      if (dataMap.fetchableId) {
        const fetchable = this.configuration.fetchables.find(
          (f) => f.id === dataMap.fetchableId,
        );
        if (!fetchable) {
          throw new DataIntegrityError(
            `Start node id=${this.node.id} has no fetchable with id=${dataMap.fetchableId}`,
          );
        }
        this.addFetchable(fetchables, urls, dataMap, fetchable);
        continue;
      }

      const value = contextUtils.getByJsonPath(inputJson, dataMap.jsonPath);
      if (value === undefined) {
        return this.getFailedResult(`"${dataMap.jsonPath}" is missing`);
      }

      if (!isValidFeelType(value, dataMap.dataType)) {
        return this.getFailedResult(
          `"${dataMap.jsonPath}" not of type ${dataMap.dataType}`,
        );
      }

      constants[dataMap.contextVariableName] = value;
    }

    return await this.getCompletedResult();
  }
}
