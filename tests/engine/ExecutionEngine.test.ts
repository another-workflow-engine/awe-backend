import { instanceRepository } from "../../src/repositories/instance.repository.js";
import { taskRepository } from "../../src/repositories/task.repository.js";
import { taskExecutionRepository } from "../../src/repositories/taskExecution.repository.js";
import { nodeRepository } from "../../src/repositories/node.repository.js";
import { edgeRepository } from "../../src/repositories/edge.repository.js";
import { StartNodeExecutor } from "../../src/engine/executors/StartNodeExecutor.js";
import { EndNodeExecutor } from "../../src/engine/executors/EndNodeExecutor.js";
import { UserTaskExecutor } from "../../src/engine/executors/UserTaskExecutor.js";
import { DecisionNodeExecutor } from "../../src/engine/executors/DecisionNodeExecutor.js";
import { edgeResolver } from "../../src/engine/EdgeResolver.js";
import { executionEngine } from "../../src/engine/ExecutionEngine.js";
import { TaskStatuses, InstanceStatuses, NodeTypes } from "../../src/types/enums.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import { DataIntegrityError } from "../../src/errors/DataIntegrity.js";
import type { NodeModel, EdgeModel, InstanceModel, TaskModel, TaskExecutionModel } from "../../src/types/models.js";
import type { WorkflowContext } from "../../src/engine/types.js";

jest.mock("../../src/database.js", () => ({
  db: {
    transaction: jest.fn(() => ({
      execute: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    })),
  },
}));
jest.mock("../../src/repositories/instance.repository.js");
jest.mock("../../src/repositories/task.repository.js");
jest.mock("../../src/repositories/taskExecution.repository.js");
jest.mock("../../src/repositories/node.repository.js");
jest.mock("../../src/repositories/edge.repository.js");
jest.mock("../../src/engine/EdgeResolver.js");
jest.mock("../../src/engine/executors/StartNodeExecutor.js", () => ({
  StartNodeExecutor: jest.fn().mockImplementation(function (this: any) {
    this.execute = jest.fn();
  }),
}));
jest.mock("../../src/engine/executors/EndNodeExecutor.js", () => ({
  EndNodeExecutor: jest.fn().mockImplementation(function (this: any) {
    this.execute = jest.fn();
  }),
}));
jest.mock("../../src/engine/executors/UserTaskExecutor.js", () => ({
  UserTaskExecutor: jest.fn().mockImplementation(function (this: any) {
    this.execute = jest.fn();
  }),
}));
jest.mock("../../src/engine/executors/DecisionNodeExecutor.js", () => ({
  DecisionNodeExecutor: jest.fn().mockImplementation(function (this: any) {
    this.execute = jest.fn();
  }),
}));

const emptyContext: WorkflowContext = { global: {} };

const mockInstance: InstanceModel = {
  id: "inst-1",
  workflow_version_id: "wfv-1",
  status: "in_progress",
  auto_advance: true,
  input_variables: { amount: 500 },
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const baseNodeProps = {
  client_id: "client-n",
  workflow_version_id: "wfv-1",
  configuration: {},
  max_attempts: 1,
  name: null,
  description: null,
  input_schema: null,
  output_schema: null,
  x_coordinate: null,
  y_coordinate: null,
  is_deleted: false,
  created_by: "actor-1",
  modified_by: "actor-1",
  created_on: new Date(),
  modified_on: new Date(),
  deleted_by: null,
  deleted_on: null,
};

const startNode: NodeModel = { ...baseNodeProps, id: "node-start", client_id: "client-start", type: NodeTypes.START };
const endNode: NodeModel = { ...baseNodeProps, id: "node-end", client_id: "client-end", type: NodeTypes.END };
const userNode: NodeModel = { ...baseNodeProps, id: "node-user", client_id: "client-user", type: "user" };
const serviceNode: NodeModel = { ...baseNodeProps, id: "node-service", client_id: "client-service", type: "service" };
const decisionNode: NodeModel = { ...baseNodeProps, id: "node-decision", client_id: "client-decision", type: NodeTypes.DECISION, configuration: { rules: [] } };

const baseEdgeProps = {
  name: null,
  is_deleted: false,
  created_by: "actor-1",
  modified_by: "actor-1",
  created_on: new Date(),
  modified_on: new Date(),
  deleted_by: null,
  deleted_on: null,
};

const edgeStartToEnd: EdgeModel = {
  ...baseEdgeProps,
  id: "edge-1",
  client_id: "client-edge-1",
  source_node_id: "node-start",
  destination_node_id: "node-end",
  condition_expression: null,
};

const mockTask1: TaskModel = { id: "task-1", instance_id: "inst-1", node_id: "node-start", status: "in_progress", created_on: new Date() };
const mockTask2: TaskModel = { id: "task-2", instance_id: "inst-1", node_id: "node-end", status: "in_progress", created_on: new Date() };
const mockTaskUser: TaskModel = { id: "task-user", instance_id: "inst-1", node_id: "node-user", status: "in_progress", created_on: new Date() };
const mockTaskDecision: TaskModel = { id: "task-decision", instance_id: "inst-1", node_id: "node-decision", status: "in_progress", created_on: new Date() };

const mockTaskExec1: TaskExecutionModel = {
  id: "texec-1", task_id: "task-1", status: "in_progress",
  started_on: new Date(), ended_on: null,
  input_variables: null, output_variables: null, created_on: new Date(),
};
const mockTaskExec2: TaskExecutionModel = { ...mockTaskExec1, id: "texec-2", task_id: "task-2" };
const mockTaskExecUser: TaskExecutionModel = { ...mockTaskExec1, id: "texec-user", task_id: "task-user" };
const mockTaskExecDecision: TaskExecutionModel = { ...mockTaskExec1, id: "texec-decision", task_id: "task-decision" };

const mockInstanceWithVars: InstanceModel = { ...mockInstance, current_variables: { global: { amount: 500 } } };
const mockCompletedInstance: InstanceModel = { ...mockInstance, status: "completed" };
const mockFailedInstance: InstanceModel = { ...mockInstance, status: "failed" };
const mockPausedInstance: InstanceModel = { ...mockInstance, status: "paused" };

const completedStartResult = {
  status: TaskStatuses.COMPLETED,
  outputVariables: { constants: { amount: 500 }, fetchables: {}, urls: {} },
};

const completedEndResult = {
  status: TaskStatuses.COMPLETED,
  outputVariables: { result: 500 },
};

const completedDecisionResult = {
  status: TaskStatuses.COMPLETED,
  outputVariables: {},
};

const allNodes = [startNode, endNode, userNode, decisionNode];

let startExecMock: jest.Mock;
let endExecMock: jest.Mock;
let userExecMock: jest.Mock;
let decisionExecMock: jest.Mock;

beforeAll(() => {
  startExecMock = (jest.mocked(StartNodeExecutor).mock.instances[0] as any).execute;
  endExecMock = (jest.mocked(EndNodeExecutor).mock.instances[0] as any).execute;
  userExecMock = (jest.mocked(UserTaskExecutor).mock.instances[0] as any).execute;
  decisionExecMock = (jest.mocked(DecisionNodeExecutor).mock.instances[0] as any).execute;
});

/** Helper: set up mocks for the "next" path (non-end, non-failed, completed node) */
function mockNextPath(edges: EdgeModel[], nextNodeIds: string[]) {
  jest.mocked(edgeRepository.findBySourceNodeId).mockResolvedValueOnce(edges);
  jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce(allNodes);
  jest.mocked(edgeResolver.resolveNextNodeIds).mockResolvedValueOnce(nextNodeIds);
}

describe("ExecutionEngine", () => {
  describe("runNode()", () => {
    it("start node COMPLETED → outcome 'next' with nextNodeIds", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce(completedStartResult);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([edgeStartToEnd], ["node-end"]);

      const result = await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(result.outcome).toBe("next");
      if (result.outcome === "next") {
        expect(result.nextNodeIds).toContain("node-end");
      }
    });

    it("end node COMPLETED → outcome 'completed', instance status completed", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(endNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask2);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec2);
      endExecMock.mockResolvedValueOnce(completedEndResult);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockCompletedInstance);

      const result = await executionEngine.runNode(mockInstance, "node-end", emptyContext);
      expect(result.outcome).toBe("completed");
      expect(result.instance.status).toBe(InstanceStatuses.COMPLETED);
    });

    it("executor returns FAILED → outcome 'failed', instanceRepository.updateById called with FAILED", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce({ status: TaskStatuses.FAILED, outputVariables: {}, error: "executor failed" });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockFailedInstance);

      const result = await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(result.outcome).toBe("failed");
      expect(jest.mocked(instanceRepository.updateById)).toHaveBeenCalledWith(
        mockInstance.id,
        expect.objectContaining({ status: InstanceStatuses.FAILED }),
        {},
      );
    });

    it("executor throws → treated as FAILED, outcome 'failed'", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockRejectedValueOnce(new Error("unexpected crash"));
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockFailedInstance);

      const result = await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(result.outcome).toBe("failed");
    });

    it("nodeId not found → throws DataIntegrityError", async () => {
      await expect(
        executionEngine.runNode(mockInstance, "nonexistent-node", emptyContext),
      ).rejects.toThrow(DataIntegrityError);
    });

    it("node type has no registered executor → throws StateTransitionError", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(serviceNode);

      await expect(
        executionEngine.runNode(mockInstance, "node-service", emptyContext),
      ).rejects.toThrow(StateTransitionError);
    });

    it("user task node returns IN_PROGRESS → outcome 'user_task', instance set to PAUSED", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(userNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTaskUser);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExecUser);
      userExecMock.mockResolvedValueOnce({ status: TaskStatuses.IN_PROGRESS, outputVariables: { requestData: {}, responseMap: [] } });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockPausedInstance);

      const result = await executionEngine.runNode(mockInstance, "node-user", emptyContext);
      expect(result.outcome).toBe("user_task");
      if (result.outcome === "user_task") {
        expect(result.taskId).toBe("task-user");
      }
      expect(jest.mocked(instanceRepository.updateById)).toHaveBeenCalledWith(
        mockInstance.id,
        expect.objectContaining({ status: InstanceStatuses.PAUSED }),
        {},
      );
    });

    it("no outgoing edges → outcome 'failed'", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce(completedStartResult);
      jest.mocked(instanceRepository.updateById)
        .mockResolvedValueOnce(mockInstanceWithVars)
        .mockResolvedValueOnce(mockFailedInstance);
      mockNextPath([], []);

      const result = await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(result.outcome).toBe("failed");
    });

    it("end node FAILED → outcome 'failed'", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(endNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask2);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec2);
      endExecMock.mockResolvedValueOnce({ status: TaskStatuses.FAILED, outputVariables: {}, error: "end failed" });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockFailedInstance);

      const result = await executionEngine.runNode(mockInstance, "node-end", emptyContext);
      expect(result.outcome).toBe("failed");
    });

    it("non-START node: executor output is merged into the incoming context", async () => {
      const incomingContext: WorkflowContext = { global: { existing: "kept" } };
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(userNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTaskUser);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExecUser);
      userExecMock.mockResolvedValueOnce({ status: TaskStatuses.COMPLETED, outputVariables: { newVar: 42 } });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([edgeStartToEnd], ["node-end"]);

      const result = await executionEngine.runNode(mockInstance, "node-user", incomingContext);
      expect(result.outcome).toBe("next");
      if (result.outcome === "next") {
        expect(result.context.global).toMatchObject({ existing: "kept", constants: { newVar: 42 } });
      }
    });

    it("taskRepository.insert is called once per runNode call", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce(completedStartResult);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([edgeStartToEnd], ["node-end"]);

      await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(jest.mocked(taskRepository.insert)).toHaveBeenCalledTimes(1);
    });

    it("taskExecutionRepository.insert is called once per runNode call", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce(completedStartResult);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([edgeStartToEnd], ["node-end"]);

      await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(jest.mocked(taskExecutionRepository.insert)).toHaveBeenCalledTimes(1);
    });

    it("START node output becomes global context in 'next' outcome", async () => {
      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(startNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTask1);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExec1);
      startExecMock.mockResolvedValueOnce(completedStartResult);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([edgeStartToEnd], ["node-end"]);

      const result = await executionEngine.runNode(mockInstance, "node-start", emptyContext);
      expect(result.outcome).toBe("next");
      if (result.outcome === "next") {
        expect(result.context.global).toMatchObject({ constants: { amount: 500 } });
      }
    });

    it("decision node COMPLETED → delegates to edgeResolver for next nodes", async () => {
      decisionExecMock.mockResolvedValueOnce(completedDecisionResult);

      jest.mocked(nodeRepository.findById).mockResolvedValueOnce(decisionNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce(mockTaskDecision);
      jest.mocked(taskExecutionRepository.insert).mockResolvedValueOnce(mockTaskExecDecision);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce(mockInstanceWithVars);
      mockNextPath([], ["node-end"]);

      const ctx: WorkflowContext = { global: { amount: 500 } };
      const result = await executionEngine.runNode(mockInstance, "node-decision", ctx);

      expect(result.outcome).toBe("next");
      expect(jest.mocked(edgeResolver.resolveNextNodeIds)).toHaveBeenCalled();
      if (result.outcome === "next") {
        expect(result.nextNodeIds).toContain("node-end");
      }
    });
  });
});
