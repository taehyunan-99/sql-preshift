import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { SchemaGraph } from './api';

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

// ── n홉 부분집합(BFS) ──
// 입력(NL/SQL)이 닿는 테이블을 seed로, FK 그래프에서 n홉 안에 닿는 table id 집합을 반환한다.
// 큰 DB(1,000+ 테이블) 전체를 dagre로 그리면 O(N³)로 수 분 걸리므로, 영향권 부분집합만 그린다.

// 양방향 인접리스트 — edges는 source→target 단방향이라 양쪽 모두 등록한다.
// (users ALTER 시 users를 FK 참조하는 orders가 핵심 영향 대상인데, 단방향이면 놓친다.)
function buildAdjacency(edges: { source: string; target: string }[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let set = adj.get(a);
    if (!set) {
      set = new Set<string>();
      adj.set(a, set);
    }
    set.add(b);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return adj;
}

// seed에서 hops 단계 안에 닿는 모든 id를 BFS로 수집(seed 포함). hops<=0이면 seed만.
export function collectNHop(
  edges: { source: string; target: string }[],
  seedIds: string[],
  hops: number,
): Set<string> {
  const result = new Set<string>(seedIds);
  if (hops <= 0) return result;
  const adj = buildAdjacency(edges);
  let frontier = seedIds;
  for (let depth = 0; depth < hops; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const neighbors = adj.get(id);
      if (!neighbors) continue;
      for (const nb of neighbors) {
        if (!result.has(nb)) {
          result.add(nb);
          next.push(nb);
        }
      }
    }
    if (next.length === 0) break; // 더 확장할 이웃 없음
    frontier = next;
  }
  return result;
}

// 주어진 id 집합으로 그래프를 필터 — 노드는 id가 집합에 있는 것만,
// 엣지는 source·target이 둘 다 집합에 있는 것만(끊긴 엣지 제거).
export function filterGraphByIds(graph: SchemaGraph, ids: Set<string>): SchemaGraph {
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}
