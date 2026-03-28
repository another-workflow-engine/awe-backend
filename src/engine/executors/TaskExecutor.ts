import { EngineError } from "../../errors/EngineError";
import { taskExecutionService } from "../../services/taskExecution.service";
import type { ContextVariables, ExecutorResult } from "../../types/engine";
import { NodeTypes, TaskStatuses } from "../../types/enums";
import type { NodeModel, TaskModel } from "../../types/models";
import type { BaseExecutor } from "./BaseExecutor";
import { DecisionNodeExecutor } from "./DecisionNodeExecutor";
import { EndNodeExecutor } from "./EndNodeExecutor";
import { ScriptNodeExecutor } from "./ScriptNodeExecutor";
import { ServiceNodeExecutor } from "./ServiceNodeExecuter";
import { StartNodeExecutor } from "./StartNodeExecutor";

const EXECUTORS: Partial<Record<string, BaseExecutor>> = {
  [NodeTypes.START]: new StartNodeExecutor(),
  [NodeTypes.END]: new EndNodeExecutor(),
  [NodeTypes.DECISION]: new DecisionNodeExecutor(),
  [NodeTypes.SCRIPT]: new ScriptNodeExecutor(),
  [NodeTypes.SERVICE]: new ServiceNodeExecutor(),
};

export default class TaskExecutor {
  private executor: BaseExecutor;
  private node: NodeModel;
  private task: TaskModel;

  constructor(task: TaskModel, node: NodeModel) {
    this.task = task;
    this.node = node;

    const executor = EXECUTORS[this.node.type];
    if (!executor) {
      throw new EngineError(`Executor for ${node.type} not implemented`);
    }

    this.executor = executor;
  }

  async run(context: ContextVariables): Promise<ExecutorResult> {
    const taskExecution = await taskExecutionService.create(this.task, context);

    let result;

    try {
      result = await this.executor.execute(this.node, context);
    } catch (err) {
      let message = "Unkown error";
      if (err instanceof Error) {
        message = err.message;
      }
      await taskExecutionService.fail(this.task.instance_id, taskExecution.id, {
        message,
        error: err,
      });

      return {
        status: TaskStatuses.FAILED,
        outputVariables: {},
        nextNodeId: null,
        errorMessage: message,
      };
    }

    if (result.status === TaskStatuses.COMPLETED) {
      await taskExecutionService.complete(
        this.task.instance_id,
        taskExecution.id,
        result.outputVariables,
      );

      return result;
    }

    await taskExecutionService.fail(this.task.instance_id, taskExecution.id, {
      message: result.errorMessage ?? "Unkown error",
    });
    return result;
  }
}
