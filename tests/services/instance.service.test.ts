import { instanceService } from "../../src/services/instance.service.js";
import { InstanceStatuses } from "../../src/types/enums.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { FeelDataType } from "../../src/types/enums.js";
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
const mockStartNode = {
  id: "node-start",
  type: "start",
  configuration: {
    inputDataMap: [],
    fetchables: [],
  },
} as NodeModel;
const mockInstance: InstanceModel = {
  id: "inst-1",
  auto_advance: true,
  current_node_id: "node-current",
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
const mockPausedInstance: InstanceModel = {
  ...mockInstance,
  status: InstanceStatuses.PAUSED,
  auto_advance: false,
};
const mockActor = { id: "actor-1" } as any;
const emptyContext = { global: {} };
const mockTask: TaskModel = { id: "task-1", instance_id: "inst-1", node_id: "node-prev", status: "completed", created_on: new Date() };
const mockNodes: NodeModel[] = [mockStartNode];
const mockEdges: EdgeModel[] = [];

describe("instanceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValue(undefined);
    jest.mocked(contextManager.create).mockReturnValue(emptyContext);
    jest.mocked(contextManager.fromJson).mockReturnValue(emptyContext);
    jest.mocked(queueService.enqueue).mockResolvedValue(undefined);
  });

  describe("createNew()", () => {
    it("inserts instance, enqueues start node job, and returns instance", async () => {
      jest.mocked(workflowVersionService.getActiveVersionByWorkflowId).mockResolvedValueOnce(mockWorkflowVersion);
      jest.mocked(instanceRepository.insert).mockResolvedValueOnce(mockInstance);
      jest.mocked(nodeService.getByStartNodeByWorkflowVersionIdOrThrow).mockResolvedValueOnce(mockStartNode);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce({ ...mockTask, node_id: "node-start" });

      const result = await instanceService.createNew({ workflowId: "wf-1", context: {}, autoAdvance: true }, mockActor);

      expect(instanceRepository.insert).toHaveBeenCalledTimes(1);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1" }),
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
      jest.mocked(taskRepository.insert).mockResolvedValueOnce({ ...mockTask, id: "task-start-custom", node_id: "node-start-custom" });

      await instanceService.createNew({ workflowId: "wf-1", context: {}, autoAdvance: true }, mockActor);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-start-custom" }),
      );
    });

    it("throws ValidationError when instance input has unexpected fields", async () => {
      const startNodeWithInput = {
        ...mockStartNode,
        configuration: {
          inputDataMap: [
            {
              jsonPath: "path_id",
              dataType: FeelDataType.STRING,
              contextVariableName: "path_id",
              required: true,
            },
          ],
          fetchables: [],
        },
      } as NodeModel;

      jest.mocked(workflowVersionService.getActiveVersionByWorkflowId).mockResolvedValueOnce(mockWorkflowVersion);
      jest.mocked(nodeService.getByStartNodeByWorkflowVersionIdOrThrow).mockResolvedValueOnce(startNodeWithInput);

      await expect(
        instanceService.createNew(
          {
            workflowId: "wf-1",
            context: { path_id: "ok", extra_field: true },
            autoAdvance: true,
          },
          mockActor,
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getById()", () => {
    it("returns instance when found", async () => {
      jest.mocked(instanceRepository.findDetailByIdForActor).mockResolvedValueOnce(mockInstance);
      const result = await instanceService.getById("inst-1", "actor-1");
      expect(result).toEqual(mockInstance);
    });

    it("returns undefined when not found", async () => {
      jest.mocked(instanceRepository.findDetailByIdForActor).mockResolvedValueOnce(undefined);
      const result = await instanceService.getById("nonexistent", "actor-1");
      expect(result).toBeUndefined();
    });
  });

  describe("advanceInstance()", () => {
    it("throws NotFoundError when instance does not exist", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(undefined);
      await expect(instanceService.advanceInstance("nonexistent", "actor-1")).rejects.toThrow(NotFoundError);
    });

    it("throws StateTransitionError when instance is not paused", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce({
        ...mockInstance,
        auto_advance: false,
      });
      await expect(instanceService.advanceInstance("inst-1", "actor-1")).rejects.toThrow(StateTransitionError);
    });

    it("throws StateTransitionError when instance has no current node", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce({
        ...mockPausedInstance,
        current_node_id: null,
      });
      await expect(instanceService.advanceInstance("inst-1", "actor-1")).rejects.toThrow(StateTransitionError);
    });

    it("throws StateTransitionError when current node does not exist", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(nodeService.getById).mockResolvedValueOnce(undefined as unknown as NodeModel);
      await expect(instanceService.advanceInstance("inst-1", "actor-1")).rejects.toThrow(StateTransitionError);
    });

    it("enqueues next nodes and updates instance to IN_PROGRESS for paused instance", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(nodeService.getById).mockResolvedValueOnce({ id: "node-next" } as NodeModel);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce({ ...mockTask, id: "task-next", node_id: "node-next" });
      jest.mocked(instanceRepository.updateById).mockResolvedValueOnce({ ...mockPausedInstance, status: InstanceStatuses.IN_PROGRESS });

      const result = await instanceService.advanceInstance("inst-1", "actor-1");

      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-next" }),
      );
      expect(result.status).toBe(InstanceStatuses.PAUSED);
    });

    it("creates only one next task for current node", async () => {
      jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockPausedInstance);
      jest.mocked(nodeService.getById).mockResolvedValueOnce({ id: "node-next" } as NodeModel);
      jest.mocked(taskRepository.insert).mockResolvedValueOnce({ ...mockTask, id: "task-single", node_id: "node-next" });

      await instanceService.advanceInstance("inst-1", "actor-1");
      expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
