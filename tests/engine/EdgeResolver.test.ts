import { edgeResolver } from "../../src/engine/EdgeResolver.js";
import { NodeTypes } from "../../src/types/enums.js";
import type { NodeModel, EdgeModel } from "../../src/types/models.js";

jest.mock("../../src/utils/contextResolver.js", () => ({
  buildFeelContext: jest.fn(async (ctx: {
    constants?: Record<string, unknown>;
  }) => {
    const variables: Record<string, unknown> = {
      ...(ctx.constants ?? {}),
    };
    return { context: variables };
  }),
}));

const baseNode = {
  client_id: "client-n",
  workflow_version_id: "wfv-1",
  configuration: {},
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

const makeNode = (id: string, type: NodeModel["type"]): NodeModel => ({
  ...baseNode,
  id,
  client_id: `client-${id}`,
  type,
});

const baseEdge = {
  client_id: "client-e",
  name: null,
  is_deleted: false,
  created_by: "actor-1",
  modified_by: "actor-1",
  created_on: new Date(),
  modified_on: new Date(),
  deleted_by: null,
  deleted_on: null,
};

const makeEdge = (
  id: string,
  source: string,
  dest: string | null,
  cond: string | null = null,
): EdgeModel => ({
  ...baseEdge,
  id,
  client_id: `client-${id}`,
  source_node_id: source,
  destination_node_id: dest,
  condition_expression: cond,
});

const emptyContext = { global: {} };

describe("EdgeResolver", () => {
  describe("non-decision nodes", () => {
    it("returns the destination id for a single outgoing edge", async () => {
      const nodes = [makeNode("n1", NodeTypes.START), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "n1", "n2")];
      await expect(edgeResolver.resolveNextNodeIds("n1", emptyContext, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("returns all destination ids for multiple outgoing edges", async () => {
      const nodes = [
        makeNode("n1", NodeTypes.START),
        makeNode("n2", NodeTypes.END),
        makeNode("n3", NodeTypes.END),
      ];
      const edges = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n1", "n3")];
      const result = await edgeResolver.resolveNextNodeIds("n1", emptyContext, edges, nodes);
      expect(result).toEqual(expect.arrayContaining(["n2", "n3"]));
      expect(result).toHaveLength(2);
    });

    it("returns empty array when there are no outgoing edges", async () => {
      const nodes = [makeNode("n1", NodeTypes.END)];
      await expect(edgeResolver.resolveNextNodeIds("n1", emptyContext, [], nodes)).resolves.toEqual([]);
    });

    it("excludes edges with null destination_node_id", async () => {
      const nodes = [makeNode("n1", NodeTypes.START)];
      const edges = [makeEdge("e1", "n1", null)];
      await expect(edgeResolver.resolveNextNodeIds("n1", emptyContext, edges, nodes)).resolves.toEqual([]);
    });

    it("treats completedNodeId not found in nodes as a non-decision node", async () => {
      const nodes = [makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "unknown-id", "n2")];
      await expect(edgeResolver.resolveNextNodeIds("unknown-id", emptyContext, edges, nodes)).resolves.toEqual(["n2"]);
    });
  });

  describe("decision nodes", () => {
    it("returns destination of matching conditional edge", async () => {
      const ctx = { global: { amount: 500 } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.amount > 100")];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("falls back to default edge when no condition matches", async () => {
      const ctx = { global: { amount: 10 } };
      const nodes = [
        makeNode("d1", NodeTypes.DECISION),
        makeNode("n2", NodeTypes.END),
        makeNode("n3", NodeTypes.END),
      ];
      const edges = [
        makeEdge("e1", "d1", "n2", "context.amount > 100"),
        makeEdge("e2", "d1", "n3", null),
      ];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n3"]);
    });

    it("returns empty array when no condition matches and no default edge", async () => {
      const ctx = { global: { amount: 10 } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.amount > 100")];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual([]);
    });

    it("returns all destinations when multiple conditions match", async () => {
      const ctx = { global: { amount: 500 } };
      const nodes = [
        makeNode("d1", NodeTypes.DECISION),
        makeNode("n2", NodeTypes.END),
        makeNode("n3", NodeTypes.END),
      ];
      const edges = [
        makeEdge("e1", "d1", "n2", "context.amount > 100"),
        makeEdge("e2", "d1", "n3", "context.amount > 200"),
      ];
      const result = await edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes);
      expect(result).toEqual(expect.arrayContaining(["n2", "n3"]));
      expect(result).toHaveLength(2);
    });

    it("resolves fetchable variables for decision evaluation", async () => {
      const ctx = {
        global: {
          constants: { threshold: 100 },
          fetchables: { serverValue: { urlId: "url1", jsonPath: "data.value" } },
          urls: { url1: { url: "https://api.example.com/data", headers: {} } },
        },
      };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.threshold > 50")];
      const result = await edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes);
      expect(result).toEqual(["n2"]);
    });

    it("normalizes == to = for FEEL compatibility (number)", async () => {
      const ctx = { global: { amount: 500 } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.amount == 500")];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("normalizes == to = for FEEL compatibility (string)", async () => {
      const ctx = { global: { id: "7" } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", 'context.id == "7"')];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("normalizes === to = for FEEL compatibility", async () => {
      const ctx = { global: { amount: 500 } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.amount === 500")];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("does not alter != operator during normalization", async () => {
      const ctx = { global: { amount: 500 } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", "context.amount != 100")];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });

    it("does not alter == inside string literals", async () => {
      const ctx = { global: { label: "a==b" } };
      const nodes = [makeNode("d1", NodeTypes.DECISION), makeNode("n2", NodeTypes.END)];
      const edges = [makeEdge("e1", "d1", "n2", 'context.label = "a==b"')];
      await expect(edgeResolver.resolveNextNodeIds("d1", ctx, edges, nodes)).resolves.toEqual(["n2"]);
    });
  });
});
