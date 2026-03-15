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
import { StartNodeExecutor } from "./executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "./executors/EndNodeExecutor.js";
import { UserTaskExecutor } from "./executors/UserTaskExecutor.js";
import { DecisionNodeExecutor } from "./executors/DecisionNodeExecutor.js";
import type { BaseExecutor } from "./executors/BaseExecutor.js";
import {
  InstanceStatuses,
  NodeTypes,
  TaskStatuses,
} from "../types/enums.js";
import { converterUtils } from "../utils/converter.utils.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";
import { StateTransitionError } from "../errors/StateTransitionError.js";
import { buildFeelContext } from "../utils/contextResolver.js";
import { evaluate } from "@bpmn-io/feelin";
import { executionLogger } from "../utils/executionLogger.js";

const executors: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.USER]: new UserTaskExecutor(),
  [NodeTypes.DECISION]: new DecisionNodeExecutor(),
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

      executionLogger.nodeStart({
        instanceId: instance.id,
        nodeId:     node.id,
        nodeType:   node.type,
        nodeName:   node.name ?? null,
        startedAt:  startedOn,
      });

      let result: ExecutorResult;
      try {
        result = await executor.execute(instance, node, context, tx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = {
          status: TaskStatuses.FAILED,
          outputVariables: {},
          error: msg,
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

      executionLogger.nodeComplete({
        instanceId: instance.id,
        nodeId:     node.id,
        nodeType:   node.type,
        startedAt:  startedOn,
        status:     result.status,
        outputKeys: Object.keys(result.outputVariables),
        ...(result.error !== undefined ? { error: result.error } : {}),
      });

      if (node.type === NodeTypes.END) {
        const instanceStatus =
          result.status === TaskStatuses.FAILED
            ? InstanceStatuses.FAILED
            : InstanceStatuses.COMPLETED;

        const endedAt        = new Date();
        const instanceStarted = new Date(instance.started_on as unknown as string);

        const updated = await instanceRepository.updateById(
          instance.id,
          {
            status: instanceStatus,
            output_variables: converterUtils.objectToJsonValue(
              result.outputVariables,
            ),
            ended_on: endedAt,
          },
          tx,
        );

        const resultMapping = Object.entries(result.outputVariables).map(
          ([name, value]) => ({ name, value }),
        );
        const endMsg = (result.outputVariables as Record<string, unknown>)
          ?.message as string | undefined;

        if (instanceStatus === InstanceStatuses.COMPLETED) {
          executionLogger.endNodeSuccess({
            instanceId:      instance.id,
            nodeId:          node.id,
            completedAt:     endedAt,
            resultMapping,
            instanceStarted,
            ...(endMsg !== undefined ? { message: endMsg } : {}),
          });
          executionLogger.instanceSummary({
            instanceId:        instance.id,
            workflowVersionId: instance.workflow_version_id,
            startedAt:         instanceStarted,
            endedAt,
            status:            "completed",
            ...(endMsg !== undefined ? { completionMessage: endMsg } : {}),
          });
        } else {
          executionLogger.endNodeFailure({
            instanceId:      instance.id,
            nodeId:          node.id,
            failedAt:        endedAt,
            instanceStarted,
            ...(endMsg !== undefined ? { message: endMsg } : {}),
            ...(result.error !== undefined ? { reason: result.error } : {}),
          });
          executionLogger.instanceSummary({
            instanceId:        instance.id,
            workflowVersionId: instance.workflow_version_id,
            startedAt:         instanceStarted,
            endedAt,
            status:            "failed",
            ...(result.error !== undefined ? { failureReason: result.error } : {}),
          });
        }

        const outcome =
          instanceStatus === InstanceStatuses.COMPLETED ? "completed" : "failed";
        return { outcome, instance: updated };
      }

      // ── Generic executor failure (non-end node) ──────────────────────────────
      if (result.status === TaskStatuses.FAILED) {
        const failedAt        = new Date();
        const instanceStarted = new Date(instance.started_on as unknown as string);

        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.FAILED, ended_on: failedAt },
          tx,
        );

        executionLogger.midNodeFailure({
          instanceId: instance.id,
          nodeId:     node.id,
          nodeType:   node.type,
          failedAt,
          reason:     result.error ?? "Executor failed with no message",
        });
        executionLogger.instanceSummary({
          instanceId:        instance.id,
          workflowVersionId: instance.workflow_version_id,
          startedAt:         instanceStarted,
          endedAt:           failedAt,
          status:            "failed",
          ...(result.error !== undefined ? { failureReason: result.error } : {}),
        });

        return { outcome: "failed", instance: updated };
      }

      if (result.status === TaskStatuses.IN_PROGRESS) {
        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.PAUSED },
          tx,
        );

        executionLogger.userTaskCreated({
          taskId:      task.id,
          instanceId:  instance.id,
          nodeId:      node.id,
          createdAt:   startedOn,
          displayData: result.outputVariables,
        });

        return { outcome: "user_task", instance: updated, taskId: task.id };
      }

      let updatedContext: WorkflowContext;
      if (node.type === NodeTypes.START) {
        updatedContext = { global: result.outputVariables };
      } else {
        updatedContext = contextManager.merge(context, result.outputVariables);
      }

      const updatedInstance = await instanceRepository.updateById(
        instance.id,
        { current_variables: converterUtils.objectToJsonValue(updatedContext) },
        tx,
      );

      const edges = await edgeRepository.findBySourceNodeId(nodeId, tx);

      let nextNodeIds: string[];

      if (node.type === NodeTypes.DECISION) {
        nextNodeIds = await resolveDecisionEdges(
          edges,
          updatedContext,
          node.id,
          instance.id,
        );
      } else {
        nextNodeIds = edges
          .map((e) => e.destination_node_id)
          .filter((id): id is string => id !== null);
      }

      if (nextNodeIds.length === 0) {
        const failedAt        = new Date();
        const instanceStarted = new Date(instance.started_on as unknown as string);

        const updated = await instanceRepository.updateById(
          instance.id,
          { status: InstanceStatuses.FAILED, ended_on: failedAt },
          tx,
        );

        executionLogger.midNodeFailure({
          instanceId: instance.id,
          nodeId:     node.id,
          nodeType:   node.type,
          failedAt,
          reason:     "No outgoing edges — workflow has no next step",
        });
        executionLogger.instanceSummary({
          instanceId:        instance.id,
          workflowVersionId: instance.workflow_version_id,
          startedAt:         instanceStarted,
          endedAt:           failedAt,
          status:            "failed",
          failureReason:     "No outgoing edges",
        });

        return { outcome: "failed", instance: updated };
      }

      executionLogger.transition({
        fromNodeId:   node.id,
        fromNodeType: node.type,
        toNodeIds:    nextNodeIds,
        reason:
          node.type === NodeTypes.DECISION ? "condition matched" : "sequential",
      });

      return {
        outcome: "next",
        instance: updatedInstance,
        nextNodeIds,
        context: updatedContext,
      };
    });
  },
};

async function resolveDecisionEdges(
  edges: Awaited<ReturnType<typeof edgeRepository.findBySourceNodeId>>,
  context: WorkflowContext,
  nodeId: string,
  instanceId: string,
): Promise<string[]> {
  const feelContext = await buildFeelContext(context);

  const conditional = edges.filter((e) => e.condition_expression !== null);
  const defaultEdge = edges.find((e) => e.condition_expression === null);

  const evaluations: {
    expression: string;
    result:     unknown;
    matched:    boolean;
    destNodeId: string;
  }[] = [];

  const matched = conditional
    .filter((e) => {
      const evalResult = evaluate(e.condition_expression!, feelContext);
      const isMatch    = evalResult.value === true;
      evaluations.push({
        expression: e.condition_expression!,
        result:     evalResult.value,
        matched:    isMatch,
        destNodeId: e.destination_node_id ?? "(unknown)",
      });
      return isMatch;
    })
    .map((e) => e.destination_node_id)
    .filter((id): id is string => id !== null);

  const usedDefault  = matched.length === 0 && !!defaultEdge?.destination_node_id;
  const selectedIds  =
    matched.length > 0
      ? matched
      : defaultEdge?.destination_node_id
        ? [defaultEdge.destination_node_id]
        : [];

  executionLogger.decisionEvaluation({
    instanceId,
    nodeId,
    feelCtxKeys:  Object.keys(feelContext.context ?? {}),
    evaluations,
    selectedIds,
    usedDefault,
  });

  if (matched.length > 0) return matched;

  if (defaultEdge?.destination_node_id) {
    return [defaultEdge.destination_node_id];
  }

  return [];
}
