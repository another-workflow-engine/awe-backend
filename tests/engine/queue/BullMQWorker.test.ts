import { ExecutionWorker } from "../../../src/engine/queue/ExecutionWorker.js";
import { InstanceStatuses } from "../../../src/types/enums.js";
import type { QueueJob } from "../../../src/engine/queue/types.js";
import type { Job } from "bullmq";

let capturedProcessor: ((job: Job<QueueJob>) => Promise<void>) | undefined;

const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockQueueAdd = jest.fn().mockResolvedValue({});

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: Job<QueueJob>) => Promise<void>) => {
    capturedProcessor = processor;
    return { on: mockWorkerOn, close: mockWorkerClose };
  }),
  Queue: jest.fn(),
}));

jest.mock("../../../src/repositories/instance.repository.js");
jest.mock("../../../src/engine/ExecutionEngine.js");

import { instanceRepository } from "../../../src/repositories/instance.repository.js";
import { executionEngine } from "../../../src/engine/ExecutionEngine.js";

const mockQueue = { add: mockQueueAdd } as any;
const connection = { host: "localhost", port: 6379 };

const mockInstance = {
  id: "inst-1",
  auto_advance: true,
  workflow_version_id: "wfv-1",
  status: InstanceStatuses.IN_PROGRESS,
  input_variables: null,
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const mockPausedInstance = { ...mockInstance, status: InstanceStatuses.PAUSED };
const mockContext = { global: { amount: 100 }, next: {} };

function makeJob(instanceId = "inst-1", nodeId = "node-1"): Job<QueueJob> {
  return { data: { instanceId, nodeId, context: mockContext }, id: "job-1" } as any;
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
    it("skips processing when instance is not found", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(undefined);
      await capturedProcessor!(makeJob());
      expect(executionEngine.runNode).not.toHaveBeenCalled();
    });

    it("skips processing when instance status is not in_progress", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockPausedInstance as any);
      await capturedProcessor!(makeJob());
      expect(executionEngine.runNode).not.toHaveBeenCalled();
    });

    it("calls executionEngine.runNode with correct args when instance is in_progress", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({ outcome: "completed", instance: mockInstance as any });
      await capturedProcessor!(makeJob());
      expect(executionEngine.runNode).toHaveBeenCalledWith(mockInstance, "node-1", mockContext);
    });

    it("enqueues next nodes when outcome is 'next' and auto_advance is true", async () => {
      const nextContext = { global: { amount: 200 }, next: {} };
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({
        outcome: "next",
        instance: mockInstance as any,
        nextNodeIds: ["node-2", "node-3"],
        context: nextContext,
      });
      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).toHaveBeenCalledTimes(2);
      expect(mockQueueAdd).toHaveBeenCalledWith("execute-node", { instanceId: "inst-1", nodeId: "node-2", context: nextContext }, expect.objectContaining({ jobId: "inst-1-node-2" }));
      expect(mockQueueAdd).toHaveBeenCalledWith("execute-node", { instanceId: "inst-1", nodeId: "node-3", context: nextContext }, expect.objectContaining({ jobId: "inst-1-node-3" }));
    });

    it("marks instance as PAUSED when outcome is 'next' and auto_advance is false", async () => {
      const manualInstance = { ...mockInstance, auto_advance: false };
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(manualInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({
        outcome: "next",
        instance: manualInstance as any,
        nextNodeIds: ["node-2"],
        context: mockContext,
      });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce({ ...manualInstance, status: InstanceStatuses.PAUSED } as any);
      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).not.toHaveBeenCalled();
      expect(instanceRepository.updateById).toHaveBeenCalledWith("inst-1", { status: InstanceStatuses.PAUSED });
    });

    it("does not enqueue or update instance when outcome is 'user_task'", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({ outcome: "user_task", instance: mockInstance as any, taskId: "task-user" });
      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).not.toHaveBeenCalled();
      expect(instanceRepository.updateById).not.toHaveBeenCalled();
    });

    it("does not enqueue next nodes when outcome is 'completed'", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({ outcome: "completed", instance: mockInstance as any });
      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("does not enqueue next nodes when outcome is 'failed'", async () => {
      jest.mocked(instanceRepository.findById).mockResolvedValueOnce(mockInstance as any);
      jest.mocked(executionEngine.runNode).mockResolvedValueOnce({ outcome: "failed", instance: mockInstance as any });
      await capturedProcessor!(makeJob());
      expect(mockQueueAdd).not.toHaveBeenCalled();
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
