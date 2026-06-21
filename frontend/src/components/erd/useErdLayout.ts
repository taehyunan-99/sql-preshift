'use client';

import { useMemo } from 'react';
import type React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { SchemaGraph, NodeDef } from '../../lib/api';
import { applyDagreLayout } from '../../lib/erd-layout';

const DIFF_EDGE_STYLE: Record<string, React.CSSProperties> = {
  added: { stroke: 'var(--color-success)', strokeWidth: 2 },
  removed: { stroke: 'var(--color-error)', strokeWidth: 2, strokeDasharray: '5 3' },
  unchanged: { stroke: '#666', strokeWidth: 1.5 },
};

export function useErdLayout(graph: SchemaGraph): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const columnCounts: Record<string, number> = {};
    const rawNodes: Node[] = graph.nodes.map((n: NodeDef) => {
      columnCounts[n.id] = n.columns.length;
      return {
        id: n.id,
        type: 'tableNode',
        position: { x: 0, y: 0 },
        data: n as unknown as Record<string, unknown>,
      };
    });

    const rawEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceColumn,
      targetHandle: e.targetColumn,
      type: 'smoothstep',
      style: DIFF_EDGE_STYLE[e.diff] ?? DIFF_EDGE_STYLE.unchanged,
    }));

    return applyDagreLayout(rawNodes, rawEdges, columnCounts);
  }, [graph]);
}
