import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 240;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 28;

// 각 노드의 실제 높이 계산 (헤더 + 컬럼수 × 행높이)
export function calcNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT;
}

export type PositionMap = Record<string, { x: number; y: number }>;

// before/after 합집합(union)으로 dagre를 한 번만 돌려 노드별 좌상단 좌표 맵을 만든다.
// Split뷰에서 두 패널이 이 좌표를 공유 → 같은 테이블이 양쪽에서 동일 위치에 놓인다.
// (각 패널이 독립 레이아웃하면 노드 집합이 달라 같은 테이블도 다른 좌표로 흩어진다.)
export function computeUnionPositions(
  graphs: { nodes: { id: string; columns: unknown[] }[]; edges: { source: string; target: string }[] }[],
): PositionMap {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 });

  // 노드 union — id 중복 시 컬럼 수가 더 많은 쪽 높이를 채택(after에 added 컬럼 포함 케이스).
  const heights: Record<string, number> = {};
  for (const graph of graphs) {
    for (const n of graph.nodes) {
      const h = calcNodeHeight(n.columns.length);
      heights[n.id] = Math.max(heights[n.id] ?? 0, h);
    }
  }
  for (const [id, h] of Object.entries(heights)) {
    g.setNode(id, { width: NODE_WIDTH, height: h });
  }

  // 엣지 union — 양쪽 그래프의 모든 관계를 dagre에 먹여 rank가 한쪽에 치우치지 않게.
  const seen = new Set<string>();
  for (const graph of graphs) {
    for (const e of graph.edges) {
      const key = `${e.source}->${e.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (heights[e.source] != null && heights[e.target] != null) {
        g.setEdge(e.source, e.target);
      }
    }
  }

  dagre.layout(g);

  const positions: PositionMap = {};
  for (const id of Object.keys(heights)) {
    const pos = g.node(id);
    positions[id] = { x: pos.x - NODE_WIDTH / 2, y: pos.y - heights[id] / 2 };
  }
  return positions;
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
