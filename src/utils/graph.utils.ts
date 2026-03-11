import type { NodeModel, EdgeModel } from "../types/models.js";

export type Graph = {
  adjacency: Map<string, string[]>;
  incoming: Map<string, number>;
  nodeMap: Map<string, NodeModel>;
};

export const graphUtils = {
  buildGraph: (nodes: NodeModel[], edges: EdgeModel[]): Graph => {
    const adjacency = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const node of nodes) {
      adjacency.set(node.id, []);
      incoming.set(node.id, 0);
    }

    for (const edge of edges) {
      if (!edge.destination_node_id) continue;

      adjacency.get(edge.source_node_id)?.push(edge.destination_node_id);

      incoming.set(
        edge.destination_node_id,
        (incoming.get(edge.destination_node_id) ?? 0) + 1,
      );
    }

    return { adjacency, incoming, nodeMap };
  },

  detectCycle: (nodes: NodeModel[], graph: Graph): boolean => {
    const { adjacency, incoming } = graph;

    const incomingCopy = new Map(incoming);
    const queue: string[] = [];

    for (const [id, count] of incomingCopy) {
      if (count === 0) queue.push(id);
    }

    let visited = 0;

    while (queue.length) {
      const node = queue.shift()!;
      visited++;

      for (const next of adjacency.get(node) ?? []) {
        const count = (incomingCopy.get(next) ?? 0) - 1;
        incomingCopy.set(next, count);

        if (count === 0) queue.push(next);
      }
    }

    return visited !== nodes.length;
  },

  reachableFrom: (startId: string, graph: Graph): Set<string> => {
    const { adjacency } = graph;

    const visited = new Set<string>();
    const queue = [startId];

    while (queue.length) {
      const node = queue.shift()!;

      if (visited.has(node)) continue;

      visited.add(node);

      for (const next of adjacency.get(node) ?? []) {
        queue.push(next);
      }
    }

    return visited;
  },
};
