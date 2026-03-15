import { taskController } from "../../src/controllers/task.controller.js";
import { taskService, type ResolvedTaskItem } from "../../src/services/task.service.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { RepositoryError } from "../../src/errors/RepositoryError.js";
import { mockRequest, mockResponse } from "../helpers/mockExpress.js";
import { ZodError } from "zod";

jest.mock("../../src/services/task.service.js");

const mockActor = { id: "actor-1" } as any;

const mockTask: ResolvedTaskItem = {
  id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
  instance_id: "inst-1",
  node_id: "node-1",
  status: "completed",
  created_on: new Date(),
  node_configuration: { title: "Test Task", requestMap: [], responseMap: [] },
  workflow_name: "Test Workflow",
  instance_context: null,
  resolvedDisplayData: {},
};

describe("taskController", () => {
  describe("getTask()", () => {
    it("calls res.json with the task when a valid UUID is provided and task is found", async () => {
      jest.mocked(taskService.getTask).mockResolvedValueOnce(mockTask);
      const req = mockRequest({ params: { taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890" }, actor: mockActor });
      const res = mockResponse();
      await taskController.getTask(req as any, res as any);
      expect(res.json).toHaveBeenCalledWith({ task: mockTask });
    });

    it("throws NotFoundError when task is not found", async () => {
      jest.mocked(taskService.getTask).mockResolvedValueOnce(undefined);
      const req = mockRequest({ params: { taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890" }, actor: mockActor });
      const res = mockResponse();
      await expect(taskController.getTask(req as any, res as any)).rejects.toThrow(NotFoundError);
    });

    it("throws ZodError when taskId is not a valid UUID", async () => {
      const req = mockRequest({ params: { taskId: "not-a-uuid" }, actor: mockActor });
      const res = mockResponse();
      await expect(taskController.getTask(req as any, res as any)).rejects.toThrow(ZodError);
    });

    it("throws ZodError when taskId param is missing", async () => {
      const req = mockRequest({ params: {}, actor: mockActor });
      const res = mockResponse();
      await expect(taskController.getTask(req as any, res as any)).rejects.toThrow(ZodError);
    });

    it("propagates RepositoryError thrown by the service", async () => {
      jest
        .mocked(taskService.getTask)
        .mockRejectedValueOnce(new RepositoryError("db error", new Error("connection failed")));
      const req = mockRequest({ params: { taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890" }, actor: mockActor });
      const res = mockResponse();
      await expect(taskController.getTask(req as any, res as any)).rejects.toThrow(RepositoryError);
    });
  });
});
