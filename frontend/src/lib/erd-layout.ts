import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 240;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 28;

// 각 노드의 실제 높이 계산 (헤더 + 컬럼수 × 행높이)
export function calcNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT;
}

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  columnCounts: Record<string, number>
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    const h = calcNodeHeight(columnCounts[node.id] ?? 0);
    g.setNode(node.id, { width: NODE_WIDTH, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const h = calcNodeHeight(columnCounts[node.id] ?? 0);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
