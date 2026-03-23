import { db } from "../database.js";
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { DecisionNodeExecutor } from "./executors/DecisionNodeExecutor.js";
import { ServiceNodeExecutor } from "./executors/ServiceNodeExecuter.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import { InstanceStatuses, NodeTypes, TaskStatuses } from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { ScriptNodeExecutor } from "./executors/ScriptNodeExecutor.js";
import { taskService } from "../services/task.service.js";
import { taskExecutionService } from "../services/taskExecution.service.js";
import { instanceService } from "../services/instance.service.js";
import type { InstanceStatus } from "../types/database.js";
import type { InstanceModel, NodeModel, TaskModel } from "../types/models.js";
import type {
  ContextVariables,
  ExecutorResult,
  NodeRunResult,
} from "../types/engine.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.DECISION]: new DecisionNodeExecutor(),
  [NodeTypes.SCRIPT]: new ScriptNodeExecutor(),
  [NodeTypes.SERVICE]: new ServiceNodeExecutor(),
};

export const executionEngine = {
  runNode: async (
    instance: InstanceModel,
    node: NodeModel,
    task: TaskModel,
  ): Promise<NodeRunResult> => {
    let result: ExecutorResult = {
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: {},
      nextNodeId: null,
    };

    let nodeThrew = false;
    let autoAdvance = instance.auto_advance;

    await db.transaction().execute(async (transaction) => {
      const currentInstance = await instanceService.findById(
        instance.id,
        transaction,
      );

      if (!currentInstance) {
        throw new StateTransitionError(
          `Instance id=${instance.id} not found during execution`,
        );
      }

      autoAdvance = currentInstance.auto_advance;

      if (
        currentInstance.status === InstanceStatuses.COMPLETED ||
        currentInstance.status === InstanceStatuses.FAILED ||
        currentInstance.status === InstanceStatuses.TERMINATED
      ) {
        throw new StateTransitionError(
          `Instance id=${instance.id} has already ended with status=${currentInstance.status}. Cannot execute.`,
        );
      }

      const executor = executors[node.type];
      if (!executor) {
        await instanceService.updateStatus(
          instance.id,
          InstanceStatuses.FAILED,
          transaction,
        );
        await taskService.updateStatus(
          task.id,
          TaskStatuses.FAILED,
          transaction,
        );
        throw new StateTransitionError(
          `Executor for node type="${node.type}" not found`,
        );
      }

      const freshInputJson = converterUtils.jsonValueToObject(
        currentInstance.input_variables,
      );

      const inputVariables: ContextVariables =
        node.type === NodeTypes.START
          ? {
              constants: freshInputJson as Record<string, unknown>,
              fetchables: {},
              urls: {},
            }
          : (converterUtils.jsonValueToObject(
              currentInstance.current_variables,
            ) as ContextVariables);

      let currentVariables: ContextVariables = converterUtils.jsonValueToObject(
        currentInstance.current_variables,
      ) as ContextVariables;

      if (!currentVariables || typeof currentVariables !== "object") {
        currentVariables = {
          constants: {} as Record<string, unknown>,
          fetchables: {},
          urls: {},
        };
      }

      currentVariables.constants = currentVariables.constants ?? {};
      currentVariables.fetchables = currentVariables.fetchables ?? {};
      currentVariables.urls = currentVariables.urls ?? {};

      await instanceService.updateStatus(
        instance.id,
        InstanceStatuses.IN_PROGRESS,
        transaction,
      );

      await taskService.updateStatus(
        task.id,
        TaskStatuses.IN_PROGRESS,
        transaction,
      );

      const taskExecution = await taskExecutionService.startNew(
        task.id,
        TaskStatuses.IN_PROGRESS,
        inputVariables,
        transaction,
      );

      try {
        result = await executor.execute(node, inputVariables, transaction);
      } catch (err) {
        console.error(err);
        nodeThrew = true;
        let message = "Unknown error";
        if (err instanceof Error) {
          message = err.message;
        }
        result = {
          status: TaskStatuses.FAILED,
          outputVariables: {},
          error: message,
          nextNodeId: null,
        };
      }

      if (node.type === NodeTypes.START) {
        currentVariables = result.outputVariables as ContextVariables;
      } else if (node.type !== NodeTypes.END) {
        currentVariables.constants = {
          ...currentVariables.constants,
          ...result.outputVariables,
        };
      }

      let instanceStatus: InstanceStatus;

      if (nodeThrew) {
        instanceStatus = InstanceStatuses.FAILED;
      } else if (
        result.status === TaskStatuses.IN_PROGRESS &&
        node.type === NodeTypes.USER
      ) {
        instanceStatus = InstanceStatuses.PAUSED;
      } else if (result.status === TaskStatuses.TERMINATED) {
        instanceStatus = InstanceStatuses.TERMINATED;
      } else if (node.type === NodeTypes.END) {
        instanceStatus = InstanceStatuses.COMPLETED;
      } else if (
        result.nextNodeId === null ||
        result.status === TaskStatuses.FAILED
      ) {
        instanceStatus = InstanceStatuses.FAILED;
      } else {
        instanceStatus = autoAdvance
          ? InstanceStatuses.IN_PROGRESS
          : InstanceStatuses.PAUSED;
      }

      let instanceUpdate;
      if (node.type === NodeTypes.END && !nodeThrew) {
        instanceUpdate = instanceService.end(
          instance.id,
          instanceStatus,
          result.outputVariables,
          transaction,
        );
      } else {
        instanceUpdate = instanceService.updateContext(
          instance.id,
          instanceStatus,
          currentVariables,
          result.nextNodeId,
          transaction,
        );
      }

      await Promise.all([
        taskExecutionService.end(
          taskExecution.id,
          result.status,
          result.outputVariables,
          transaction,
        ),
        taskService.updateStatus(task.id, result.status, transaction),
        instanceUpdate,
      ]);
    });

    return {
      nextNodeIds:
        result.nextNodeId === null || !autoAdvance ? [] : [result.nextNodeId],
    };
  },
};
