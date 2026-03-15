import { instanceService } from "../../src/services/instance.service.js";
import { InstanceStatuses } from "../../src/types/enums.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { DataIntegrityError } from "../../src/errors/DataIntegrity.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import type { InstanceModel, TaskModel, NodeModel, EdgeModel } from "../../src/types/models.js";

jest.mock("../../src/repositories/instance.repository.js");
jest.mock("../../src/repositories/task.repository.js");
jest.mock("../../src/repositories/node.repository.js");
jest.mock("../../src/repositories/edge.repository.js");
jest.mock("../../src/services/workflowVersion.service.js");
jest.mock("../../src/services/node.services.js");
jest.mock("../../src/services/queue.service.js");
jest.mock("../../src/engine/EdgeResolver.js");
jest.mock("../../src/engine/ContextManager.js");
jest.mock("../../src/database.js", () => ({
  db: {
    transaction: jest.fn(() => ({
      execute: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    })),
  },
}));

import { instanceRepository } from "../../src/repositories/instance.repository.js";
import { taskRepository } from "../../src/repositories/task.repository.js";
import { nodeRepository } from "../../src/repositories/node.repository.js";
import { edgeRepository } from "../../src/repositories/edge.repository.js";
import { workflowVersionService } from "../../src/services/workflowVersion.service.js";
import { nodeService } from "../../src/services/node.services.js";
import { queueService } from "../../src/services/queue.service.js";
import { edgeResolver } from "../../src/engine/EdgeResolver.js";
import { contextManager } from "../../src/engine/ContextManager.js";

const mockWorkflowVersion = { id: "wfv-1", workflow_id: "wf-1", status: "active" } as any;
const mockStartNode = { id: "node-start", type: "start" } as NodeModel;
const mockInstance: InstanceModel = {
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
const mockPausedInstance: InstanceModel = { ...mockInstance, status: InstanceStatuses.PAUSED };
const mockActor = { id: "actor-1" } as any;
const emptyContext = { global: {} };
const mockTask: TaskModel = { id: "task-1", instance_id: "inst-1", node_id: "node-prev", status: "completed", created_on: new Date() };
const mockNodes: NodeModel[] = [mockStartNode];
const mockEdges: EdgeModel[] = [];

describe("instanceService", () => {
  beforeEach(() => {
    jest.mocked(contextManager.create).mockReturnValue(emptyContext);
    jest.mocked(contextManager.fromJson).mockReturnValue(emptyContext);
    jest.mocked(queueService.enqueue).mockResolvedValue(undefined);
  });

  describe("createNew()", () => {
    it("inserts instance, enqueues start node job, and returns instance", async () => {
      jest.mocked(workflowVersionService.getActiveVersionByWorkflowId).mockResolvedValueOnce(mockWorkflowVersion);
      jest.mocked(instanceRepository.insert).mockResolvedValueOnce(mockInstance);
      jest.mocked(nodeService.getByStartNodeByWorkflowVersionIdOrThrow).mockResolvedValueOnce(mockStartNode);

      const result = await instanceService.createNew({ workflowId: "wf-1", context: {}, autoAdvance: true }, mockActor);

      expect(instanceRepository.insert).toHaveBeenCalledTimes(1);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ instanceId: "inst-1", nodeId: "node-start" }),
      );
      expect(result).toEqual(mockInstance);
    });

    it("throws NotFoundError when no active workflow version exists", async () => {
      jest.mocked(workflowVersionService.getActiveVersionByWorkflowId).mockResolvedValueOnce(undefined as any);

      await expect(
        instanceService.createNew({ workflowId: "wf-1", context: {}, autoAdvance: true }, mockActor),
      ).rejects.toThrow(NotFoundError);
    });

    it("enqueues job with the start node ID from the workflow version", async () => {
      const customStartNode = { ...mockStartNode, id: "node-start-custom" };
      jest.mocked(workflowVersionService.getActiveVersionByWorkflowId).mockResolvedValueOnce(mockWorkflowVersion);
      jest.mocked(instanceRepository.insert).mockResolvedValueOnce(mockInstance);
      jest.mocked(nodeService.getByStartNodeByWorkflowVersionIdOrThrow).mockResolvedValueOnce(customStartNode as NodeModel);

      await instanceService.createNew({ workflowId: "wf-1", context: {}, autoAdvance: true }, mockActor);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: "node-start-custom" }),
      );
    });
  });

  describe("getById()", () => {
    it("returns instance when found", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockInstance);
      const result = await instanceService.getById("inst-1", "actor-1");
      expect(result).toEqual(mockInstance);
    });

    it("returns undefined when not found", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(undefined);
      const result = await instanceService.getById("nonexistent", "actor-1");
      expect(result).toBeUndefined();
    });
  });

  describe("resumeInstance()", () => {
    it("throws NotFoundError when instance does not exist", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(undefined);
      await expect(instanceService.resumeInstance("nonexistent", "actor-1")).rejects.toThrow(NotFoundError);
    });

    it("throws StateTransitionError when instance is not paused", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockInstance);
      await expect(instanceService.resumeInstance("inst-1", "actor-1")).rejects.toThrow(StateTransitionError);
    });

    it("throws DataIntegrityError when no completed task found", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(taskRepository.findLastCompletedByInstanceId).mockResolvedValueOnce(undefined);
      await expect(instanceService.resumeInstance("inst-1", "actor-1")).rejects.toThrow(DataIntegrityError);
    });

    it("enqueues next nodes and updates instance to IN_PROGRESS for paused instance", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(taskRepository.findLastCompletedByInstanceId).mockResolvedValueOnce(mockTask);
      jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce(mockNodes);
      jest.mocked(edgeRepository.findByNodeIds).mockResolvedValueOnce(mockEdges);
      jest.mocked(edgeResolver.resolveNextNodeIds).mockReturnValueOnce(["node-next"]);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce({ ...mockPausedInstance, status: InstanceStatuses.IN_PROGRESS });

      const result = await instanceService.resumeInstance("inst-1", "actor-1");

      expect(instanceRepository.updateById).toHaveBeenCalledWith("inst-1", { status: InstanceStatuses.IN_PROGRESS });
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: "node-next", instanceId: "inst-1" }),
      );
      expect(result.status).toBe(InstanceStatuses.IN_PROGRESS);
    });

    it("enqueues multiple next nodes when edge resolver returns multiple IDs", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(taskRepository.findLastCompletedByInstanceId).mockResolvedValueOnce(mockTask);
      jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce(mockNodes);
      jest.mocked(edgeRepository.findByNodeIds).mockResolvedValueOnce(mockEdges);
      jest.mocked(edgeResolver.resolveNextNodeIds).mockReturnValueOnce(["node-a", "node-b"]);
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce({ ...mockPausedInstance, status: InstanceStatuses.IN_PROGRESS });

      await instanceService.resumeInstance("inst-1", "actor-1");
      expect(queueService.enqueue).toHaveBeenCalledTimes(2);
    });
  });
});
