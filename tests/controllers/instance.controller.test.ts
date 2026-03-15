import { instanceController } from "../../src/controllers/instance.controller.js";
import { InstanceStatuses } from "../../src/types/enums.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import { ZodError } from "zod";
import type { InstanceModel } from "../../src/types/models.js";
import { mockRequest, mockResponse } from "../helpers/mockExpress.js";

jest.mock("../../src/services/instance.service.js");

import { instanceService } from "../../src/services/instance.service.js";

const VALID_UUID = "00000000-0000-4000-a000-000000000001";

const mockInstance: InstanceModel = {
  id: VALID_UUID,
  auto_advance: true,
  workflow_version_id: "00000000-0000-4000-a000-000000000002",
  status: InstanceStatuses.IN_PROGRESS,
  input_variables: null,
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};
const mockPausedInstance: InstanceModel = { ...mockInstance, status: InstanceStatuses.PAUSED };
const mockActor = { id: "actor-1" } as any;

describe("instanceController", () => {
  describe("create()", () => {
    it("returns 201 with created instance", async () => {
      jest.mocked(instanceService.createNew).mockResolvedValueOnce(mockInstance);
      const req = mockRequest({ body: { workflowId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await instanceController.create(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ instance: mockInstance });
    });

    it("throws ZodError when workflowId is not a UUID", async () => {
      const req = mockRequest({ body: { workflowId: "not-a-uuid" }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.create(req as any, res as any)).rejects.toThrow(ZodError);
    });

    it("propagates NotFoundError when no active workflow version found", async () => {
      jest.mocked(instanceService.createNew).mockRejectedValueOnce(new NotFoundError("No active workflow version found"));
      const req = mockRequest({ body: { workflowId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.create(req as any, res as any)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getById()", () => {
    it("returns instance when found", async () => {
      jest.mocked(instanceService.getById).mockResolvedValueOnce(mockInstance);
      const req = mockRequest({ params: { instanceId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await instanceController.getById(req as any, res as any);
      expect(res.json).toHaveBeenCalledWith({ instance: mockInstance });
    });

    it("throws NotFoundError when instance not found", async () => {
      jest.mocked(instanceService.getById).mockResolvedValueOnce(undefined);
      const req = mockRequest({ params: { instanceId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.getById(req as any, res as any)).rejects.toThrow(NotFoundError);
    });

    it("throws ZodError when instanceId is not a valid UUID", async () => {
      const req = mockRequest({ params: { instanceId: "bad-uuid" }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.getById(req as any, res as any)).rejects.toThrow(ZodError);
    });
  });

  describe("resumeInstance()", () => {
    it("returns updated instance when resume succeeds", async () => {
      jest.mocked(instanceService.resumeInstance).mockResolvedValueOnce({ ...mockPausedInstance, status: InstanceStatuses.IN_PROGRESS });
      const req = mockRequest({ params: { instanceId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await instanceController.resumeInstance(req as any, res as any);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ instance: expect.objectContaining({ status: InstanceStatuses.IN_PROGRESS }) }));
    });

    it("throws ZodError when instanceId is not a valid UUID", async () => {
      const req = mockRequest({ params: { instanceId: "bad-id" }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.resumeInstance(req as any, res as any)).rejects.toThrow(ZodError);
    });

    it("propagates StateTransitionError when instance is not paused", async () => {
      jest.mocked(instanceService.resumeInstance).mockRejectedValueOnce(new StateTransitionError("not paused"));
      const req = mockRequest({ params: { instanceId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.resumeInstance(req as any, res as any)).rejects.toThrow(StateTransitionError);
    });

    it("propagates NotFoundError when instance does not exist", async () => {
      jest.mocked(instanceService.resumeInstance).mockRejectedValueOnce(new NotFoundError("not found"));
      const req = mockRequest({ params: { instanceId: VALID_UUID }, actor: mockActor });
      const res = mockResponse();
      await expect(instanceController.resumeInstance(req as any, res as any)).rejects.toThrow(NotFoundError);
    });
  });
});
