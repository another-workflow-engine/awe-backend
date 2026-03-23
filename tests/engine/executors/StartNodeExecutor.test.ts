import { StartNodeExecutor } from "../../../src/engine/executors/StartNodeExecutor.js";
import { TaskStatuses } from "../../../src/types/enums.js";
import { DataIntegrityError } from "../../../src/errors/DataIntegrity.js";
import type { NodeModel } from "../../../src/types/models.js";

jest.mock("../../../src/services/edge.services.js", () => ({
  edgeService: {
    getNextNodeIdsBySourceNodeId: jest.fn(),
  },
}));

import { edgeService } from "../../../src/services/edge.services.js";

const executor = new StartNodeExecutor();
const tx = null as any;

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
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(edgeService.getNextNodeIdsBySourceNodeId)
      .mockResolvedValue(["node-next"]);
  });

  it("maps constants from input variables", async () => {
    const node = makeNode({
      inputDataMap: [
        {
          jsonPath: "amount",
          dataType: "number",
          contextVariableName: "amount",
          persist: false,
        },
      ],
      fetchables: [],
    });

    const result = await executor.execute(
      node,
      { constants: { amount: 500 }, fetchables: {}, urls: {} },
      tx,
    );

    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect((result.outputVariables as any).constants.amount).toBe(500);
    expect(result.nextNodeId).toBe("node-next");
  });

  it("stores fetchable metadata and url expression", async () => {
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
      fetchables: [
        {
          id: "fetch-user",
          method: "GET",
          urlExpression: '"https://api.example.com"',
        },
      ],
    });

    const result = await executor.execute(
      node,
      { constants: { userId: "u1" }, fetchables: {}, urls: {} },
      tx,
    );

    const output = result.outputVariables as any;
    expect(output.constants.userVar).toBeUndefined();
    expect(output.fetchables.userVar).toEqual({
      urlId: "fetch-user",
      jsonPath: "userId",
      dataType: "string",
    });
    expect(output.urls["fetch-user"]).toEqual({
      urlExpression: '"https://api.example.com"',
      headers: {},
    });
  });

  it("returns FAILED when required input field is missing", async () => {
    const node = makeNode({
      inputDataMap: [
        {
          jsonPath: "missing",
          dataType: "string",
          contextVariableName: "value",
          persist: false,
        },
      ],
      fetchables: [],
    });

    const result = await executor.execute(
      node,
      { constants: {}, fetchables: {}, urls: {} },
      tx,
    );

    expect(result.status).toBe(TaskStatuses.FAILED);
    expect(result.error).toContain("missing");
    expect(result.nextNodeId).toBeNull();
  });

  it("throws DataIntegrityError when configuration is invalid", async () => {
    const node = makeNode("not-an-object");
    await expect(
      executor.execute(node, { constants: {}, fetchables: {}, urls: {} }, tx),
    ).rejects.toThrow(DataIntegrityError);
  });
});
