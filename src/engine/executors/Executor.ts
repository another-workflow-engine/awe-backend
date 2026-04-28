import type { NodeModel } from "../../types/models.js";
import type {
  Context,
  ExecutorResult,
  EvaluatedContext,
} from "../../types/engine.js";
import { TaskStatuses, TimeUnit } from "../../types/enums.js";
import { edgeService } from "../../services/edge.services.js";
import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import {
  convertToMilliseconds,
  converterUtils,
} from "../../utils/converter.utils.js";
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
    signal?: AbortSignal,
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

    const timeoutInMilliseconds = this.getTimeoutInMilliseconds();
    if (!timeoutInMilliseconds) {
      return this.execute(evaluatedContext);
    }

    const timeoutMessage = `Execution timed out after ${timeoutInMilliseconds}ms`;
    const timeoutController = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<ExecutorResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timeoutController.abort(timeoutMessage);
        resolve(this.getTerminatedResult(timeoutMessage));
      }, timeoutInMilliseconds);
    });

    const executionPromise = this.execute(
      evaluatedContext,
      timeoutController.signal,
    ).catch((error) => {
      if (timeoutController.signal.aborted) {
        return this.getTerminatedResult(timeoutMessage);
      }

      throw error;
    });

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private getTimeoutInMilliseconds(): number | undefined {
    const configuration = this.configuration as Record<string, unknown>;

    const timeoutConfig = configuration.timeout;
    if (
      timeoutConfig &&
      typeof timeoutConfig === "object" &&
      !Array.isArray(timeoutConfig)
    ) {
      const timeout = timeoutConfig as {
        delay?: unknown;
        unit?: unknown;
      };

      if (
        typeof timeout.delay === "number" &&
        Number.isFinite(timeout.delay) &&
        timeout.delay > 0
      ) {
        const unit =
          timeout.unit === TimeUnit.SECOND ||
          timeout.unit === TimeUnit.MINUTE ||
          timeout.unit === TimeUnit.MILLISECOND
            ? timeout.unit
            : TimeUnit.MILLISECOND;

        return convertToMilliseconds(timeout.delay, unit);
      }
    }

    const legacyTimeout = configuration.timeoutMs;
    if (
      typeof legacyTimeout === "number" &&
      Number.isFinite(legacyTimeout) &&
      legacyTimeout > 0
    ) {
      return legacyTimeout;
    }

    return undefined;
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

  protected getTerminatedResult(message: string): ExecutorResult {
    return {
      executionId: this.executionId,
      status: TaskStatuses.TERMINATED,
      outputVariables: this.outputVariables,
      nextNodeId: null,
      errorMessage: message,
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
