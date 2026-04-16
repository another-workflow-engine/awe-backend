import type { Transaction } from "kysely";
import { EngineError } from "../../errors/EngineError.js";
import { taskExecutionService } from "../../services/taskExecution.service.js";
import type { DB, NodeType } from "../../types/database.js";
import type { Context, ExecutorResult } from "../../types/engine.js";
import { NodeTypes, TaskStatuses } from "../../types/enums.js";
import type { NodeModel, TaskModel } from "../../types/models.js";
import type { BaseExecutor } from "./BaseExecutor.js";
import { DecisionNodeExecutor } from "./DecisionNodeExecutor.js";
import { EmailNodeExecutor } from "./EmailNodeExecutor.js";
import { EndNodeExecutor } from "./EndNodeExecutor.js";
import { ScriptNodeExecutor } from "./ScriptNodeExecutor.js";
import { ServiceNodeExecutor } from "./ServiceNodeExecuter.js";
import { StartNodeExecutor } from "./StartNodeExecutor.js";

type ExecutorConstructor = new (
  node: NodeModel,
  inputVariables: Context,
) => BaseExecutor<any>;

const ExecutorMap: Record<
  Exclude<NodeType, typeof NodeTypes.USER>,
  ExecutorConstructor
> = {
  [NodeTypes.START]: StartNodeExecutor,
  [NodeTypes.SERVICE]: ServiceNodeExecutor,
  [NodeTypes.SCRIPT]: ScriptNodeExecutor,
  [NodeTypes.EMAIL]: EmailNodeExecutor,
  [NodeTypes.DECISION]: DecisionNodeExecutor,
  [NodeTypes.END]: EndNodeExecutor,
};

export default class TaskExecutor {
  private executorConstructor: ExecutorConstructor;
  private node: NodeModel;
  private task: TaskModel;
  private context: Context;

  constructor(task: TaskModel, node: NodeModel, context: Context) {
    this.task = task;
    this.node = node;
    this.context = context;

    if (node.type == NodeTypes.USER) {
      throw new EngineError(
        `User task cannot be executed by engine - Task id=${task.id}`,
      );
    }

    const Executor = ExecutorMap[node.type];
    if (!Executor) {
      throw new EngineError(`Executor for ${node.type} not found`);
    }

    this.executorConstructor = Executor;
  }

  async start(transaction: Transaction<DB>): Promise<string> {
    const taskExecution = await taskExecutionService.create(
      this.task.instance_id,
      this.task.id,
      this.context,
      transaction,
    );
    return taskExecution.id;
  }

  async run(): Promise<ExecutorResult> {
    const executor = new this.executorConstructor(this.node, this.context);

    const result = await executor.run().catch((err: Error) => {
      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        nextNodeId: null,
        errorMessage: err.message,
        error: err,
      };
    });

    return result;
  }

  async end(
    executionId: string,
    result: ExecutorResult,
    transaction: Transaction<DB>,
  ) {
    if (result.status === TaskStatuses.COMPLETED) {
      await taskExecutionService.complete(
        this.task.instance_id,
        executionId,
        result.outputVariables,
        transaction,
      );
      return;
    }

    await taskExecutionService.fail(
      this.task.instance_id,
      executionId,
      {
        message: result.errorMessage ?? "Unkown error",
        error: result.error,
      },
      transaction,
    );
  }
}
