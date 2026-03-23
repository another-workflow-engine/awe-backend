import { taskService } from "../../src/services/task.service.js";
import { taskRepository } from "../../src/repositories/task.repository.js";
import { instanceService } from "../../src/services/instance.service.js";
import { RepositoryError } from "../../src/errors/RepositoryError.js";
import type { TaskDetailItem } from "../../src/repositories/task.repository.js";

jest.mock("../../src/repositories/task.repository.js");
jest.mock("../../src/services/instance.service.js");

const mockTask: TaskDetailItem = {
  id: "task-uuid-1",
  instance_id: "inst-1",
  node_id: "node-1",
  status: "completed",
  created_on: new Date(),
  node_configuration: {
    requestMap: [],
    responseMap: [],
  },
  workflow_name: "Test Workflow",
  instance_context: { constants: {}, fetchables: {}, urls: {} },
};

describe("taskService", () => {
  describe("getTask()", () => {
    it("returns the task without instance_context when repository resolves with a task", async () => {
      jest.mocked(taskRepository.findByIdWithContext).mockResolvedValueOnce(mockTask);
      jest
        .mocked(instanceService.findById)
        .mockResolvedValueOnce(
          {
            id: "inst-1",
            current_variables: {
              constants: {},
              fetchables: {},
              urls: {},
            },
          } as any,
        );

      const result = await taskService.getTask("task-uuid-1", "actor-1");

      expect(result).toEqual(
        expect.objectContaining({
          id: "task-uuid-1",
          node_id: "node-1",
          node_configuration: expect.objectContaining({
            requestMap: [],
            responseMap: [],
          }),
        }),
      );
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
