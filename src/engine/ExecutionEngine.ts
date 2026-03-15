import { db } from "../database.js";
import type { InstanceModel } from "../types/models.js";
import type { ExecutorResult, WorkflowContext } from "./types.js";
import type { NodeRunResult } from "./queue/types.js";
import { instanceRepository } from "../repositories/instance.repository.js";
import { taskRepository } from "../repositories/task.repository.js";
import { taskExecutionRepository } from "../repositories/taskExecution.repository.js";
import { nodeRepository } from "../repositories/node.repository.js";
import { edgeRepository } from "../repositories/edge.repository.js";
import { contextManager } from "./ContextManager.js";
import { edgeResolver } from "./EdgeResolver.js";
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { UserTaskExecutor } from "./executors/UserTaskExecutor.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import {
  ContextVariableScopeType,
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.USER]: new UserTaskExecutor(),
};

export const executionEngine = {
  runNode: async (
    instance: InstanceModel,
    nodeId: string,
    context: WorkflowContext,
  ): Promise<NodeRunResult> => {
    return db.transaction().execute(async (tx) => {
      const node = await nodeRepository.findById(nodeId, tx);

      if (!node) {
        throw new DataIntegrityError(
          `Node id=${nodeId} not found in for instance id=${instance.id}`,
        );
      }

      const executor = executors[node.type];
      if (!executor) {
        throw new StateTransitionError(
          `No executor available for node type="${node.type}"`,
        );
      }

      const startedOn = new Date();
      const task = await taskRepository.insert(
        {
          instance_id: instance.id,
          node_id: node.id,
          status: TaskStatuses.IN_PROGRESS,
        },
        tx,
      );

      const taskExecution = await taskExecutionRepository.insert(
        {
          task_id: task.id,
          status: TaskStatuses.IN_PROGRESS,
          started_on: startedOn,
          input_variables: converterUtils.objectToJsonValue(
            contextManager.resolveForNode(context),
          ),
        },
        tx,
      );

      let result: ExecutorResult;
      try {
        result = await executor.execute(instance, node, context, tx);
      } catch (err) {
        result = {
          status: TaskStatuses.FAILED,
          outputVariables: {},
          error: err instanceof Error ? err.message : String(err),
        };
      }

      await taskExecutionRepository.updateById(
        taskExecution.id,
        {
          status: result.status,
          ended_on: new Date(),
          output_variables: converterUtils.objectToJsonValue(
            result.outputVariables,
          ),
        },
        tx,
      );

      await taskRepository.updateById(task.id, { status: result.status }, tx);

      if (result.status === TaskStatuses.FAILED) {
        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.FAILED, ended_on: new Date() },
          tx,
        );
        return { outcome: "failed", instance: updated };
      }

      if (result.status === TaskStatuses.IN_PROGRESS) {
        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.PAUSED },
          tx,
        );
        return { outcome: "user_task", instance: updated, taskId: task.id };
      }

      if (node.type === NodeTypes.END) {
        const updated = await instanceRepository.updateById(
          instance.id,
          {
            status: InstanceStatuses.COMPLETED,
            output_variables: converterUtils.objectToJsonValue(
              result.outputVariables,
            ),
            ended_on: new Date(),
          },
          tx,
        );
        return { outcome: "completed", instance: updated };
      }

      let updatedContext: WorkflowContext;
      if (node.type === NodeTypes.START) {
        updatedContext = { global: result.outputVariables, next: {} };
      } else {
        const cleared = contextManager.clearNextScope(context);
        updatedContext = contextManager.merge(
          cleared,
          result.outputVariables,
          ContextVariableScopeType.GLOBAL,
        );
      }

      const updatedInstance = await instanceRepository.updateById(
        instance.id,
        { current_variables: converterUtils.objectToJsonValue(updatedContext) },
        tx,
      );

      const edges = await edgeRepository.findBySourceNodeId(nodeId, tx);

      let nextNodeIds: string[];

      nextNodeIds = edges
        .map((edge) => edge.destination_node_id)
        .filter((id): id is string => id !== null);

      if (nextNodeIds.length === 0) {
        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.FAILED, ended_on: new Date() },
          tx,
        );
        return { outcome: "failed", instance: updated };
      }

      return {
        outcome: "next",
        instance: updatedInstance,
        nextNodeIds,
        context: updatedContext,
      };
    });
  },
};
