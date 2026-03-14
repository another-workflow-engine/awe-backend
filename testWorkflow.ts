import { executionEngine } from "./src/Engine/ExecutionEngine.js";
import { resumeUserTask } from "./src/services/userTask.service.js";
import type { WorkflowContext } from "./src/types/workflow.type.js";

async function testWorkflow() {
  const context: WorkflowContext = {
    executionId: "exec_1",
    workflowId: "wf_1",
    data: {},
    status: "RUNNING",
  };

  console.log("Starting workflow...");

  const result = await executionEngine.executeNext(context, "node_3");

  console.log("Execution Result:");
  console.log(result);

  if (result.executionStatus === "WAITING_FOR_USER_INPUT") {
    console.log("Workflow paused. Simulating user input...");

    const resumeResult = await resumeUserTask(
      result.taskId!,
      {
        approval: true,
        comment: "Approved by tester",
      },
      context
    );

    console.log("Workflow resumed:");
    console.log(resumeResult);
  }
}

testWorkflow();