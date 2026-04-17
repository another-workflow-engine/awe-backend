import type { NodeModel } from "../../types/models.js";
import type {
  Context,
  ExecutorResult,
  EvaluatedContext,
} from "../../types/engine.js";
import { TaskStatuses } from "../../types/enums.js";
import { edgeService } from "../../services/edge.services.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { converterUtils } from "../../utils/converter.utils.js";
import type z from "zod";
import type { NodeType } from "../../types/database.js";
import {
  NodeConfigurationSchemaMap,
  type NodeConfiguration,
} from "../../types/workflow.js";
import { contextUtils } from "../../utils/context.utils.js";

export abstract class Executor<T extends NodeType> {
  protected readonly node: NodeModel;
  protected readonly inputVariables: Context;
  protected outputVariables: Record<string, unknown> = {};
  protected readonly configuration: NodeConfiguration<T>;
  private readonly executionId: string;

  protected abstract execute(
    evaluatedContext: EvaluatedContext,
  ): Promise<ExecutorResult>;

  constructor(node: NodeModel, inputVariables: Context, executionId: string) {
    this.node = node;
    this.inputVariables = inputVariables;
    this.executionId = executionId;

    this.configuration = converterUtils.parseOrThrow(
      NodeConfigurationSchemaMap[node.type] as unknown as z.ZodType<
        NodeConfiguration<T>
      >,
      node.configuration,
    );
  }

  async run(): Promise<ExecutorResult> {
    const evaluatedContext = await contextUtils.evaluateContext(
      this.inputVariables,
    );
    return this.execute(evaluatedContext);
  }

  protected getFailedResult(message: string, error?: object): ExecutorResult {
    return {
      executionId: this.executionId,
      status: TaskStatuses.FAILED,
      outputVariables: this.outputVariables,
      nextNodeId: null,
      errorMessage: message,
      ...(error && { error }),
    };
  }

  protected async getCompletedResult(
    nextNodeId?: string | null,
  ): Promise<ExecutorResult> {
    if (nextNodeId === undefined) {
      [nextNodeId] = await edgeService.getDestinationNodeIdsBySourceNodeId(
        this.node.id,
      );

      if (!nextNodeId) {
        throw new DataIntegrityError(
          `Next node for node id=${this.node.id} not found`,
        );
      }
    }

    return {
      executionId: this.executionId,
      status: TaskStatuses.COMPLETED,
      outputVariables: this.outputVariables,
      nextNodeId: nextNodeId,
    };
  }
}
