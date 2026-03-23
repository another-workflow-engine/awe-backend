import { EndNodeExecutor } from "../../../src/engine/executors/EndNodeExecutor.js";
import { TaskStatuses } from "../../../src/types/enums.js";
import { DataIntegrityError } from "../../../src/errors/DataIntegrity.js";
import type { NodeModel } from "../../../src/types/models.js";

const executor = new EndNodeExecutor();
const tx = null as any;

const makeNode = (configuration: unknown): NodeModel => ({
  id: "node-end",
  client_id: "client-end",
  workflow_version_id: "wfv-1",
  type: "end",
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

describe("EndNodeExecutor", () => {
  it("evaluates resultMap FEEL expressions and returns COMPLETED with correct outputVariables", async () => {
    const ctx = { constants: { amount: 500 }, fetchables: {}, urls: {} };
    const node = makeNode({
      success: true,
      resultMap: [
        {
          contextVariable: { name: "result", scope: "global" },
          valueExpression: "context.amount",
        },
      ],
    });
    const result = await executor.execute(node, ctx, tx);
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect(result.outputVariables.result).toBe(500);
  });

  it("returns FAILED when configuration.success is false even when FEEL evaluation succeeds", async () => {
    const node = makeNode({ success: false, resultMap: [] });
    const result = await executor.execute(
      node,
      { constants: {}, fetchables: {}, urls: {} },
      tx,
    );
    expect(result.status).toBe(TaskStatuses.FAILED);
  });

  it("throws DataIntegrityError when FEEL expression produces evaluation warnings", async () => {
    const ctx = { constants: { amount: 500 }, fetchables: {}, urls: {} };
    const node = makeNode({
      success: true,
      resultMap: [
        {
          contextVariable: { name: "result", scope: "global" },
          valueExpression: "context.amount()",
        },
      ],
    });
    await expect(executor.execute(node, ctx, tx)).rejects.toThrow(
      DataIntegrityError,
    );
  });

  it("returns COMPLETED with empty outputVariables when resultMap is empty", async () => {
    const node = makeNode({ success: true, resultMap: [] });
    const result = await executor.execute(
      node,
      { constants: {}, fetchables: {}, urls: {} },
      tx,
    );
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect(result.outputVariables).toEqual({});
  });

  it("throws DataIntegrityError when node configuration is invalid", async () => {
    const node = makeNode("not-an-object");
    await expect(
      executor.execute(node, { constants: {}, fetchables: {}, urls: {} }, tx),
    ).rejects.toThrow(DataIntegrityError);
  });

  it("includes message in outputVariables when end node has a message configured", async () => {
    const node = makeNode({ success: true, resultMap: [], message: "Workflow completed successfully!" });
    const result = await executor.execute(
      node,
      { constants: {}, fetchables: {}, urls: {} },
      tx,
    );
    expect(result.status).toBe(TaskStatuses.COMPLETED);
    expect(result.outputVariables.message).toBe("Workflow completed successfully!");
  });
});
