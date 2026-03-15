import { UserTaskExecutor } from "../../../src/engine/executors/UserTaskExecutor.js";
import { TaskStatuses } from "../../../src/types/enums.js";
import { DataIntegrityError } from "../../../src/errors/DataIntegrity.js";
import type { NodeModel, InstanceModel } from "../../../src/types/models.js";

const executor = new UserTaskExecutor();
const emptyContext = { global: {}, next: {} };
const tx = null as any;

const mockInstance: InstanceModel = {
  id: "inst-1",
  workflow_version_id: "wfv-1",
  status: "in_progress",
  auto_advance: true,
  input_variables: null,
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const makeNode = (configuration: unknown): NodeModel => ({
  id: "node-user",
  client_id: "client-user",
  workflow_version_id: "wfv-1",
  type: "user",
  configuration: configuration as any,
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
});

describe("UserTaskExecutor", () => {
  it("returns IN_PROGRESS to signal the node is awaiting user input", async () => {
    const node = makeNode({ requestMap: [], responseMap: [] });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.IN_PROGRESS);
  });

  it("evaluates requestMap FEEL expressions and stores results in requestData", async () => {
    const ctx = { global: { orderId: "ord-123", amount: 999 }, next: {} };
    const node = makeNode({
      requestMap: [
        { label: "Order ID", valueExpression: "orderId" },
        { label: "Amount", valueExpression: "amount" },
      ],
      responseMap: [],
    });
    const result = await executor.execute(mockInstance, node, ctx, tx);
    expect(result.status).toBe(TaskStatuses.IN_PROGRESS);
    const requestData = result.outputVariables.requestData as Record<string, unknown>;
    expect(requestData["Order ID"]).toBe("ord-123");
    expect(requestData["Amount"]).toBe(999);
  });

  it("includes responseMap in outputVariables for UI form rendering", async () => {
    const node = makeNode({
      requestMap: [],
      responseMap: [
        { fieldId: "approved", label: "Approved", type: "boolean", contextVariable: { name: "isApproved", scope: "global" } },
      ],
    });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    const responseMap = result.outputVariables.responseMap as unknown[];
    expect(responseMap).toHaveLength(1);
  });

  it("returns empty requestData when requestMap is empty", async () => {
    const node = makeNode({ requestMap: [], responseMap: [] });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.outputVariables.requestData).toEqual({});
  });

  it("throws DataIntegrityError when node configuration is invalid", async () => {
    const node = makeNode("not-an-object");
    await expect(executor.execute(mockInstance, node, emptyContext, tx)).rejects.toThrow(
      DataIntegrityError,
    );
  });
});
