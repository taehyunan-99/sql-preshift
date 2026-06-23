'use client';

import { useMemo } from 'react';
import { Position, type Node, type Edge } from '@xyflow/react';
import type { SchemaGraph, NodeDef } from '../../lib/api';
import { applyDagreLayout, type PositionMap } from '../../lib/erd-layout';

// positions(선택): 외부에서 계산한 공유 좌표(Split뷰 union 레이아웃). 주어지면 dagre를
// 다시 돌리지 않고 이 좌표를 쓴다 → before/after가 같은 테이블을 동일 위치에 그린다.
export function useErdLayout(
  graph: SchemaGraph,
  positions?: PositionMap,
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const columnCounts: Record<string, number> = {};
    const rawNodes: Node[] = graph.nodes.map((n: NodeDef) => {
      columnCounts[n.id] = n.columns.length;
      return {
        id: n.id,
        type: 'tableNode',
        position: positions?.[n.id] ?? { x: 0, y: 0 },
        // 핸들 방향 고정(FK source=Right → PK target=Left) — 엣지 곡선 정합.
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: n as unknown as Record<string, unknown>,
      };
    });

    // custom edge(ErdRelationEdge)로 곡선·cardinality·hover·flow 표현.
    // 색/점선은 컴포넌트가 data.diff로 결정(글로벌 룰), cardinality는 FK=N → PK=1.
    const rawEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceColumn,
      targetHandle: e.targetColumn,
      type: 'relationEdge',
      data: {
        diff: e.diff,
        sourceCard: 'N',
        targetCard: '1',
        isEstimated: e.isEstimated ?? false,
        estimatedConfidence: e.estimatedConfidence,
      },
    }));

    // 공유 좌표가 있으면 dagre 생략하고 그대로 사용(엣지는 변경 없음).
    if (positions) return { nodes: rawNodes, edges: rawEdges };
    return applyDagreLayout(rawNodes, rawEdges, columnCounts);
  }, [graph, positions]);
}
