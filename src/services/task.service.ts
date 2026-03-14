import type { Transaction } from "kysely";
import type { InstanceModel, TaskExecutionModel } from "../types/models";
import type { DB, TaskStatus } from "../types/database";
import { taskRepository } from "../repositories/task.repository";
import { TaskStatuses } from "../types/enums";
import { taskExecutionRepository } from "../repositories/taskExecution.repository";
import { nodeService } from "./node.services.js";
import { StartNodeConfigurationSchema } from "../schemas/node.schema.js";
import { evaluate } from "@bpmn-io/feelin";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { converterUtils } from "../utils/converter.utils";

interface StartTaskOutputVariables {
  constants: Record<string, unknown>;
  fetchables: Record<string, { urlId: string; jsonPath: string }>;
  urls: Record<string, string>;
}

export const taskService = {
  executeStartNode: async (
    instance: InstanceModel,
    transaction?: Transaction<DB>,
  ): Promise<TaskExecutionModel> => {
    const startedOn = new Date();

    const startNode =
      await nodeService.getByStartNodeByWorkflowVersionIdOrThrow(
        instance.workflow_version_id,
      );

    let outputVariables: StartTaskOutputVariables = {
      constants: {},
      fetchables: {},
      urls: {},
    };

    let status: TaskStatus = TaskStatuses.IN_PROGRESS;

    try {
      const parsedResult = StartNodeConfigurationSchema.safeParse(
        startNode.configuration,
      );
      if (!parsedResult.data) {
        throw new DataIntegrityError(
          `Start node configuration is invalid node id=${startNode.id}`,
        );
      }

      const configuration = parsedResult.data;
      const instanceInputVariables = converterUtils.jsonValueToObject(
        instance.input_variables,
      );

      configuration.inputDataMap.forEach((dataMap) => {
        if (dataMap.fetchableId) {
          outputVariables.fetchables[dataMap.contextVariableName] = {
            urlId: dataMap.fetchableId,
            jsonPath: dataMap.jsonPath,
          };

          return;
        }

        outputVariables.constants[dataMap.contextVariableName] =
          instanceInputVariables[dataMap.jsonPath];
      });

      configuration.fetchables.forEach((f) => {
        const result = evaluate(f.urlExpression, outputVariables.constants);
        if (result.warnings.length > 0 || typeof result.value !== "string") {
          console.log(typeof result.value);
          console.error(result.warnings);
          throw new DataIntegrityError(
            `Invalid FEEL expression exists in configuration of start node fetchables nodeId=${startNode.id} and versionId=${instance.workflow_version_id}`,
          );
        }

        outputVariables.urls[f.id] = result.value;
      });

      status = TaskStatuses.COMPLETED;
    } catch (err) {
      console.error(err);
      status = TaskStatuses.FAILED;

      if (err instanceof DataIntegrityError) {
        throw err;
      }
    } finally {
      const task = await taskRepository.insert(
        {
          instance_id: instance.id,
          status: status,
          node_id: startNode.id,
        },
        transaction,
      );
      const taskExecution = await taskExecutionRepository.insert(
        {
          status: status,
          task_id: task.id,
          started_on: startedOn,
          ended_on: new Date(),
          input_variables: instance.input_variables,
          output_variables: converterUtils.objectToJsonValue(outputVariables),
        },
        transaction,
      );

      return taskExecution;
    }
  },
};
