import { resumeUserTask } from "../../src/services/userTask.service.js";
import { NotFoundError } from "../../src/errors/NotFoundError.js";
import { StateTransitionError } from "../../src/errors/StateTransitionError.js";
import { TaskStatuses, InstanceStatuses } from "../../src/types/enums.js";
import type { TaskModel, InstanceModel, NodeModel } from "../../src/types/models.js";

jest.mock("../../src/repositories/task.repository.js");
jest.mock("../../src/repositories/instance.repository.js");
jest.mock("../../src/repositories/node.repository.js");
jest.mock("../../src/repositories/edge.repository.js");
jest.mock("../../src/engine/ContextManager.js");
jest.mock("../../src/engine/EdgeResolver.js");
jest.mock("../../src/services/queue.service.js");
jest.mock("../../src/database.js", () => ({
  db: {
    transaction: jest.fn(() => ({
      execute: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    })),
  },
}));
jest.mock("../../src/utils/converter.utils.js", () => ({
  converterUtils: {
    objectToJsonValue: jest.fn((v: unknown) => v),
    jsonValueToObject: jest.fn((v: unknown) => v ?? {}),
  },
}));

import { taskRepository } from "../../src/repositories/task.repository.js";
import { instanceRepository } from "../../src/repositories/instance.repository.js";
import { nodeRepository } from "../../src/repositories/node.repository.js";
import { edgeRepository } from "../../src/repositories/edge.repository.js";
import { contextManager } from "../../src/engine/ContextManager.js";
import { edgeResolver } from "../../src/engine/EdgeResolver.js";
import { queueService } from "../../src/services/queue.service.js";

const mockTask: TaskModel = {
  id: "task-1",
  instance_id: "inst-1",
  node_id: "node-user",
  status: TaskStatuses.IN_PROGRESS,
  created_on: new Date(),
};

const mockInstance: InstanceModel = {
  id: "inst-1",
  workflow_version_id: "wfv-1",
  status: InstanceStatuses.PAUSED,
  auto_advance: true,
  input_variables: null,
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const mockNode: NodeModel = {
  id: "node-user",
  client_id: "client-1",
  workflow_version_id: "wfv-1",
  type: "user",
  configuration: {
    requestMap: [],
    responseMap: [
      { fieldId: "approved", label: "Approved", type: "boolean", contextVariable: { name: "isApproved", scope: "global" } },
    ],
  } as any,
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

const emptyContext = { global: {} };

describe("resumeUserTask", () => {
  beforeEach(() => {
    jest.mocked(contextManager.fromJson).mockReturnValue(emptyContext);
    jest.mocked(contextManager.merge).mockReturnValue(emptyContext);
    jest.mocked(edgeResolver.resolveNextNodeIds).mockReturnValue(["node-end"]);
    jest.mocked(edgeRepository.findByNodeIds).mockResolvedValue([]);
    jest.mocked(queueService.enqueue).mockResolvedValue(undefined);
    jest.mocked(taskRepository.updateById).mockResolvedValue(mockTask);
    jest.mocked(instanceRepository.updateById).mockResolvedValue(mockInstance);
  });

  it("throws NotFoundError when task does not exist", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(undefined);
    await expect(resumeUserTask("task-1", {}, "actor-1")).rejects.toThrow(NotFoundError);
  });

  it("throws StateTransitionError when task status is not IN_PROGRESS", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce({ ...mockTask, status: TaskStatuses.COMPLETED });
    await expect(resumeUserTask("task-1", {}, "actor-1")).rejects.toThrow(StateTransitionError);
  });

  it("throws NotFoundError when instance is not found (ownership check)", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(mockTask);
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(undefined);
    await expect(resumeUserTask("task-1", {}, "actor-1")).rejects.toThrow(NotFoundError);
  });

  it("throws StateTransitionError when instance is not PAUSED", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(mockTask);
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce({ ...mockInstance, status: InstanceStatuses.IN_PROGRESS });
    await expect(resumeUserTask("task-1", {}, "actor-1")).rejects.toThrow(StateTransitionError);
  });

  it("enqueues next nodes on successful user input submission", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(mockTask);
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockInstance);
    jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce([mockNode]);

    await resumeUserTask("task-1", { approved: true }, "actor-1");

    expect(queueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "inst-1", nodeId: "node-end" }),
    );
  });

  it("maps userInput fields to context variables via responseMap", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(mockTask);
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockInstance);
    jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce([mockNode]);

    await resumeUserTask("task-1", { approved: true }, "actor-1");

    expect(contextManager.merge).toHaveBeenCalledWith(
      emptyContext,
      expect.objectContaining({ isApproved: true }),
    );
  });

  it("updates task to COMPLETED and instance to IN_PROGRESS after user input", async () => {
    jest.mocked(taskRepository.findById).mockResolvedValueOnce(mockTask);
    jest.mocked(instanceRepository.findByIdForActor).mockResolvedValueOnce(mockInstance);
    jest.mocked(nodeRepository.findByWorkflowVersionId).mockResolvedValueOnce([mockNode]);

    await resumeUserTask("task-1", { approved: true }, "actor-1");

    expect(taskRepository.updateById).toHaveBeenCalledWith("task-1", { status: TaskStatuses.COMPLETED }, {});
    expect(instanceRepository.updateById).toHaveBeenCalledWith("inst-1", expect.objectContaining({ status: InstanceStatuses.IN_PROGRESS }), {});
  });
});
