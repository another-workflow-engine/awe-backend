import { taskService } from "../../src/services/task.service.js";
import { taskRepository } from "../../src/repositories/task.repository.js";
import { RepositoryError } from "../../src/errors/RepositoryError.js";
import type { TaskDetailItem } from "../../src/repositories/task.repository.js";

jest.mock("../../src/repositories/task.repository.js");

const mockTask: TaskDetailItem = {
  id: "task-uuid-1",
  instance_id: "inst-1",
  node_id: "node-1",
  status: "completed",
  created_on: new Date(),
  node_configuration: {},
  workflow_name: "Test Workflow",
  instance_context: null,
};

describe("taskService", () => {
  describe("getTask()", () => {
    it("returns the task with resolved display data when repository resolves with a task", async () => {
      jest.mocked(taskRepository.findByIdWithContext).mockResolvedValueOnce(mockTask);
      const result = await taskService.getTask("task-uuid-1", "actor-1");
      expect(result).toEqual({ ...mockTask, resolvedDisplayData: {} });
    });

    it("returns undefined when repository resolves with undefined", async () => {
      jest.mocked(taskRepository.findByIdWithContext).mockResolvedValueOnce(undefined);
      const result = await taskService.getTask("task-uuid-1", "actor-1");
      expect(result).toBeUndefined();
    });

    it("propagates RepositoryError thrown by the repository", async () => {
      jest
        .mocked(taskRepository.findByIdWithContext)
        .mockRejectedValueOnce(new RepositoryError("db error", new Error("connection failed")));
      await expect(taskService.getTask("task-uuid-1", "actor-1")).rejects.toThrow(RepositoryError);
    });
  });
});
