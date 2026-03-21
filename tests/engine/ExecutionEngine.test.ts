import { executionEngine } from "../../src/engine/ExecutionEngine.js";
import { TaskStatuses, InstanceStatuses, NodeTypes } from "../../src/types/enums.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import type { InstanceModel, NodeModel, TaskModel } from "../../src/types/models.js";

jest.mock("../../src/database.js", () => ({
  db: {
    transaction: jest.fn(() => ({
      execute: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    })),
  },
}));

jest.mock("../../src/services/task.service.js", () => ({
  taskService: {
    updateStatus: jest.fn(async () => undefined),
  },
}));

jest.mock("../../src/services/taskExecution.service.js", () => ({
  taskExecutionService: {
    startNew: jest.fn(async () => ({ id: "texec-1" })),
    end: jest.fn(async () => undefined),
  },
}));

jest.mock("../../src/services/instance.service.js", () => ({
  instanceService: {
    findById: jest.fn(async () => undefined),
    updateStatus: jest.fn(async () => undefined),
    updateContext: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
  },
}));

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

jest.mock("../../src/engine/executors/ScriptNodeExecutor.js", () => ({
  ScriptNodeExecutor: jest.fn().mockImplementation(function (this: any) {
    this.execute = jest.fn();
  }),
}));

import { StartNodeExecutor } from "../../src/engine/executors/StartNodeExecutor.js";
import { UserTaskExecutor } from "../../src/engine/executors/UserTaskExecutor.js";
import { instanceService } from "../../src/services/instance.service.js";
import { taskService } from "../../src/services/task.service.js";

const mockInstance: InstanceModel = {
  id: "inst-1",
  workflow_version_id: "wfv-1",
  status: InstanceStatuses.IN_PROGRESS,
  auto_advance: true,
  input_variables: { amount: 100 },
  output_variables: null,
  current_variables: { constants: {}, fetchables: {}, urls: {} } as any,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const startNode: NodeModel = {
  id: "node-start",
  client_id: "c-start",
  workflow_version_id: "wfv-1",
  type: NodeTypes.START,
  configuration: { inputDataMap: [], fetchables: [] } as any,
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

const userNode: NodeModel = {
  ...startNode,
  id: "node-user",
  type: NodeTypes.USER,
  configuration: { requestMap: [], responseMap: [] } as any,
};

const mockTask: TaskModel = {
  id: "task-1",
  instance_id: "inst-1",
  node_id: "node-start",
  status: TaskStatuses.IN_PROGRESS,
  created_on: new Date(),
};

let startExecuteMock: jest.Mock;
let userExecuteMock: jest.Mock;

beforeAll(() => {
  startExecuteMock = (jest.mocked(StartNodeExecutor).mock.instances[0] as any).execute;
  userExecuteMock = (jest.mocked(UserTaskExecutor).mock.instances[0] as any).execute;
});

describe("ExecutionEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(instanceService.findById)
      .mockResolvedValue({ ...mockInstance } as any);
  });

  it("returns next node when start executor completes and auto-advance is true", async () => {
    startExecuteMock.mockResolvedValueOnce({
      status: TaskStatuses.COMPLETED,
      outputVariables: { constants: { amount: 100 }, fetchables: {}, urls: {} },
      nextNodeId: "node-next",
    });

    const result = await executionEngine.runNode(mockInstance, startNode, mockTask);

    expect(result.nextNodeIds).toEqual(["node-next"]);
    expect(jest.mocked(taskService.updateStatus)).toHaveBeenCalledWith(
      "task-1",
      TaskStatuses.IN_PROGRESS,
      {},
    );
    expect(jest.mocked(instanceService.updateContext)).toHaveBeenCalled();
  });

  it("returns no next nodes when auto-advance is false", async () => {
    jest
      .mocked(instanceService.findById)
      .mockResolvedValueOnce({ ...mockInstance, auto_advance: false } as any);

    startExecuteMock.mockResolvedValueOnce({
      status: TaskStatuses.COMPLETED,
      outputVariables: { constants: {}, fetchables: {}, urls: {} },
      nextNodeId: "node-next",
    });

    const result = await executionEngine.runNode(
      { ...mockInstance, auto_advance: false },
      startNode,
      mockTask,
    );

    expect(result.nextNodeIds).toEqual([]);
  });

  it("pauses on user task in-progress and returns no next nodes", async () => {
    userExecuteMock.mockResolvedValueOnce({
      status: TaskStatuses.IN_PROGRESS,
      outputVariables: { requestData: {}, responseMap: [] },
      nextNodeId: null,
    });

    const result = await executionEngine.runNode(
      mockInstance,
      userNode,
      { ...mockTask, node_id: "node-user" },
    );

    expect(result.nextNodeIds).toEqual([]);
    expect(jest.mocked(instanceService.updateContext)).toHaveBeenCalledWith(
      "inst-1",
      InstanceStatuses.PAUSED,
      expect.any(Object),
      null,
      {},
    );
  });

  it("throws when current instance cannot be loaded in transaction", async () => {
    jest.mocked(instanceService.findById).mockResolvedValueOnce(null);

    await expect(
      executionEngine.runNode(mockInstance, startNode, mockTask),
    ).rejects.toThrow(StateTransitionError);
  });
});
