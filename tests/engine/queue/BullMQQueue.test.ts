import { BullMQQueue } from "../../../src/engine/queue/BullMQQueue.js";

const mockQueueAdd = jest.fn().mockResolvedValue({});
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: jest.fn(),
}));

describe("BullMQQueue", () => {
  let bullMQQueue: BullMQQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    bullMQQueue = new BullMQQueue({ host: "localhost", port: 6379 });
  });

  describe("enqueue()", () => {
    it("calls queue.add() with the job data and correct options", async () => {
      const job = { taskId: "task-1" };
      await bullMQQueue.enqueue(job);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "execute-node",
        job,
        expect.objectContaining({ jobId: "task-1" }),
      );
    });

    it("sets jobId to taskId for deduplication", async () => {
      const job = { taskId: "task-xyz" };
      await bullMQQueue.enqueue(job);
      const callArgs = mockQueueAdd.mock.calls[0][2];
      expect(callArgs.jobId).toBe("task-xyz");
    });

    it("sets attempts: 1", async () => {
      await bullMQQueue.enqueue({ taskId: "x" });
      const opts = mockQueueAdd.mock.calls[0][2];
      expect(opts.attempts).toBe(1);
    });

    it("uses configured queue name", () => {
      const { Queue } = jest.requireMock("bullmq");
      const constructorArgs = Queue.mock.calls[0][0];
      expect(constructorArgs).toBe("execution-queue-test");
    });
  });

  describe("close()", () => {
    it("calls queue.close()", async () => {
      await bullMQQueue.close();
      expect(mockQueueClose).toHaveBeenCalledTimes(1);
    });
  });
});
