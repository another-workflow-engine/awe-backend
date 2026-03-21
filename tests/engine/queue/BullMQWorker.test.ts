import { ExecutionWorker } from "../../../src/engine/queue/ExecutionWorker.js";
import { TaskStatuses } from "../../../src/types/enums.js";
import type { Job } from "bullmq";

let capturedProcessor: ((job: Job<{ taskId: string }>) => Promise<void>) | undefined;

const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockQueueAdd = jest.fn().mockResolvedValue({});

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: Job<{ taskId: string }>) => Promise<void>) => {
    capturedProcessor = processor;
    return { on: mockWorkerOn, close: mockWorkerClose };
  }),
  Queue: jest.fn(),
}));

jest.mock("../../../src/engine/ExecutionEngine.js");
jest.mock("../../../src/services/task.service.js");
jest.mock("../../../src/database.js", () => ({
  db: {
    transaction: jest.fn(() => ({
      execute: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    })),
  },
}));

import { executionEngine } from "../../../src/engine/ExecutionEngine.js";
import { taskService } from "../../../src/services/task.service.js";

const mockQueue = { add: mockQueueAdd } as any;
const connection = { host: "localhost", port: 6379 };

const mockInstance = {
  id: "inst-1",
  auto_advance: true,
};
const mockNode = { id: "node-1", type: "start", configuration: {} };
const mockTask = { id: "task-1", node_id: "node-1" };

function makeJob(taskId = "task-1"): Job<{ taskId: string }> {
  return { data: { taskId }, id: "job-1" } as any;
}

describe("ExecutionWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    new ExecutionWorker(mockQueue, connection);
  });

  describe("constructor", () => {
    it("registers a 'failed' event listener on the worker", () => {
      expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
    });

    it("passes concurrency: 10 to the BullMQ Worker", () => {
      const { Worker } = jest.requireMock("bullmq");
      const opts = Worker.mock.calls[0][2];
      expect(opts.concurrency).toBe(10);
    });
  });

  describe("processJob()", () => {
    it("runs execution with resolved task details", async () => {
      jest.mocked(taskService.getAllTaskDetails).mockResolvedValueOnce({
        instance: mockInstance as any,
        node: mockNode as any,
        task: mockTask as any,
      });
      jest
        .mocked(executionEngine.runNode)
        .mockResolvedValueOnce({ nextNodeIds: [] });

      await capturedProcessor!(makeJob());
      expect(taskService.getAllTaskDetails).toHaveBeenCalledWith("task-1");
      expect(executionEngine.runNode).toHaveBeenCalledWith(
        mockInstance,
        mockNode,
        mockTask,
      );
    });

    it("does not enqueue when there are no next nodes", async () => {
      jest.mocked(taskService.getAllTaskDetails).mockResolvedValueOnce({
        instance: mockInstance as any,
        node: mockNode as any,
        task: mockTask as any,
      });
      jest
        .mocked(executionEngine.runNode)
        .mockResolvedValueOnce({ nextNodeIds: [] });

      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("enqueues one new task per next node id", async () => {
      jest.mocked(taskService.getAllTaskDetails).mockResolvedValueOnce({
        instance: mockInstance as any,
        node: mockNode as any,
        task: mockTask as any,
      });
      jest
        .mocked(executionEngine.runNode)
        .mockResolvedValueOnce({ nextNodeIds: ["node-2", "node-3"] });
      jest
        .mocked(taskService.createNew)
        .mockResolvedValueOnce({ id: "task-2" } as any)
        .mockResolvedValueOnce({ id: "task-3" } as any);

      await capturedProcessor!(makeJob());

      expect(mockQueueAdd).toHaveBeenCalledTimes(2);
      expect(jest.mocked(taskService.createNew)).toHaveBeenNthCalledWith(
        1,
        "inst-1",
        "node-2",
        TaskStatuses.IN_PROGRESS,
        {},
      );
      expect(jest.mocked(taskService.createNew)).toHaveBeenNthCalledWith(
        2,
        "inst-1",
        "node-3",
        TaskStatuses.IN_PROGRESS,
        {},
      );
      expect(mockQueueAdd).toHaveBeenNthCalledWith(
        1,
        "execute-node",
        { taskId: "task-2" },
        expect.objectContaining({ jobId: "task-2" }),
      );
      expect(mockQueueAdd).toHaveBeenNthCalledWith(
        2,
        "execute-node",
        { taskId: "task-3" },
        expect.objectContaining({ jobId: "task-3" }),
      );
    });
  });

  describe("close()", () => {
    it("calls worker.close()", async () => {
      const w = new ExecutionWorker(mockQueue, connection);
      await w.close();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });
});
