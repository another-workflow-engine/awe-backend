import type {
  WorkflowContext,
  ExecutionResult,
} from "../types/workflow.type.js";
import { taskService } from "./task.service.js";
import { executionEngine } from "../Engine/ExecutionEngine.js";

//Resume workflow after user submits input
export async function resumeUserTask(
  taskId: string,
  userInput: Record<string, any>,
  context: WorkflowContext,
): Promise<ExecutionResult> {
  const task = await taskService.getTask(taskId);

  if (!task) {
    throw new Error("Task not found");
  }

  if (task.status === "COMPLETED") {
    throw new Error("Task already completed");
  }

  //Mark task completed

  await taskService.completeTask(taskId);

  //   Merge user input into workflow context
  context.data = {
    ...context.data,
    ...userInput,
  };

  context.status = "RUNNING";

  //   Continue workflow
  return executionEngine.executeNext(context, task.nodeId);
}
