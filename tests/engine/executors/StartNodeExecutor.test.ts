import { StartNodeExecutor } from "../../../src/engine/executors/StartNodeExecutor.js";
import { TaskStatuses } from "../../../src/types/enums.js";
import { DataIntegrityError } from "../../../src/errors/DataIntegrity.js";
import type { NodeModel, InstanceModel } from "../../../src/types/models.js";

jest.mock("../../../src/services/fetch.service.js", () => ({
  fetchService: { get: jest.fn() },
}));

import { fetchService } from "../../../src/services/fetch.service.js";

const executor = new StartNodeExecutor();
const emptyContext = { global: {}, next: {} };
const tx = null as any;

const mockInstance: InstanceModel = {
  id: "inst-1",
  workflow_version_id: "wfv-1",
  status: "in_progress",
  auto_advance: true,
  input_variables: { amount: 500, label: "test" },
  output_variables: null,
  current_variables: null,
  started_on: new Date(),
  ended_on: null,
  created_by: "actor-1",
  created_on: new Date(),
};

const makeNode = (configuration: unknown): NodeModel => ({
  id: "node-1",
  client_id: "client-1",
  workflow_version_id: "wfv-1",
  type: "start",
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

describe("StartNodeExecutor", () => {
  it("maps constants correctly from instanceInputVariables", async () => {
    const node = makeNode({
      inputDataMap: [
        { jsonPath: "amount", dataType: "number", contextVariableName: "amount", persist: false },
      ],
      fetchables: [],
    });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect((result.outputVariables.constants as Record<string, unknown>).amount).toBe(500);
  });

  it("fetches data from URL and stores extracted value in constants when fetchableId is present", async () => {
    jest.mocked(fetchService.get).mockResolvedValueOnce({ userId: "user-123" });
    const node = makeNode({
      inputDataMap: [
        {
          jsonPath: "userId",
          dataType: "string",
          contextVariableName: "userVar",
          fetchableId: "fetch-user",
          persist: false,
        },
      ],
      fetchables: [{ id: "fetch-user", method: "GET", urlExpression: '"https://api.example.com"' }],
    });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    const constants = result.outputVariables.constants as Record<string, unknown>;
    const fetchables = result.outputVariables.fetchables as Record<string, unknown>;
    expect(constants["userVar"]).toBe("user-123");
    expect(fetchables["userVar"]).toBeDefined();
    expect(fetchService.get).toHaveBeenCalledWith("https://api.example.com", {});
  });

  it("deduplicates fetch calls when multiple inputDataMap entries reference the same fetchableId", async () => {
    jest.mocked(fetchService.get).mockResolvedValueOnce({ name: "Alice", age: 30 });
    const node = makeNode({
      inputDataMap: [
        { jsonPath: "name", dataType: "string", contextVariableName: "userName", fetchableId: "fetch-profile", persist: false },
        { jsonPath: "age", dataType: "number", contextVariableName: "userAge", fetchableId: "fetch-profile", persist: false },
      ],
      fetchables: [{ id: "fetch-profile", method: "GET", urlExpression: '"https://api.example.com/profile"' }],
    });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect(fetchService.get).toHaveBeenCalledTimes(1);
    const constants = result.outputVariables.constants as Record<string, unknown>;
    expect(constants["userName"]).toBe("Alice");
    expect(constants["userAge"]).toBe(30);
  });

  it("evaluates FEEL urlExpression and stores the result in urls keyed by fetchable id", async () => {
    const node = makeNode({
      inputDataMap: [],
      fetchables: [{ id: "fetch-data", method: "GET", urlExpression: '"https://api.example.com"' }],
    });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect((result.outputVariables.urls as Record<string, unknown>)["fetch-data"]).toBe(
      "https://api.example.com",
    );
  });

  it("returns COMPLETED with empty maps when inputDataMap and fetchables are empty", async () => {
    const node = makeNode({ inputDataMap: [], fetchables: [] });
    const result = await executor.execute(mockInstance, node, emptyContext, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect(result.outputVariables.constants).toEqual({});
    expect(result.outputVariables.fetchables).toEqual({});
    expect(result.outputVariables.urls).toEqual({});
  });

  it("throws DataIntegrityError when node configuration is invalid", async () => {
    const node = makeNode("not-an-object");
    await expect(executor.execute(mockInstance, node, emptyContext, tx)).rejects.toThrow(
      DataIntegrityError,
    );
  });

  it("throws DataIntegrityError when FEEL URL expression evaluates to a non-string", async () => {
    const node = makeNode({
      inputDataMap: [],
      fetchables: [{ id: "fetch-1", method: "GET", urlExpression: "42" }],
    });
    await expect(executor.execute(mockInstance, node, emptyContext, tx)).rejects.toThrow(
      DataIntegrityError,
    );
  });

  it("ignores _context and _transaction params and still returns COMPLETED", async () => {
    const node = makeNode({ inputDataMap: [], fetchables: [] });
    const result = await executor.execute(
      mockInstance,
      node,
      { global: { irrelevant: true }, next: { also: "ignored" } },
      tx,
    );
    expect(result.status).toBe(TaskStatuses.COMPLETED);
  });
});
