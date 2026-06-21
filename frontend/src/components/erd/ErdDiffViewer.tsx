'use client';

import { createContext, useContext, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  useReactFlow,
  type OnMove,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNode from './TableNode';
import { useErdLayout } from './useErdLayout';
import type { SchemaGraph, SchemaDiff, NodeDef } from '../../lib/api';
import type { RiskMap } from '../../lib/riskMap';

// 위험맵(table→level)을 TableNode 헤더 배지까지 전달하는 Context.
// xyflow는 nodeTypes 컴포넌트에 node.data만 넘기므로(data·layout 불변 제약),
// 위험 level은 Context가 유일한 비침습 경로.
const RiskMapContext = createContext<RiskMap>({});
export const useRiskMap = () => useContext(RiskMapContext);

// ── mock 데이터: ADD COLUMN(age), DROP TABLE(products), ALTER TYPE(email) ──
const MOCK_BEFORE: SchemaGraph = {
  nodes: [
    {
      id: 'public.users',
      table: 'users',
      diff: 'modified',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'name', type: 'varchar(100)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'email', type: 'varchar(255)', pk: false, fk: null, nullable: false, diff: 'modified', change: { from: 'varchar(255)', to: 'text' } },
        { name: 'created_at', type: 'timestamp', pk: false, fk: null, nullable: true, diff: 'unchanged' },
      ],
    },
    {
      id: 'public.orders',
      table: 'orders',
      diff: 'unchanged',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'user_id', type: 'integer', pk: false, fk: 'users', nullable: false, diff: 'unchanged' },
        { name: 'amount', type: 'numeric(10,2)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'status', type: 'varchar(20)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
      ],
    },
    {
      id: 'public.products',
      table: 'products',
      diff: 'removed',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: null, nullable: false, diff: 'removed' },
        { name: 'name', type: 'varchar(200)', pk: false, fk: null, nullable: false, diff: 'removed' },
        { name: 'price', type: 'numeric(10,2)', pk: false, fk: null, nullable: false, diff: 'removed' },
      ],
    },
  ],
  edges: [
    { id: 'fk_orders_user_id', source: 'public.orders', target: 'public.users', sourceColumn: 'user_id', targetColumn: 'id', diff: 'unchanged' },
  ],
};

const MOCK_AFTER: SchemaGraph = {
  nodes: [
    {
      id: 'public.users',
      table: 'users',
      diff: 'modified',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'name', type: 'varchar(100)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'email', type: 'text', pk: false, fk: null, nullable: false, diff: 'modified', change: { from: 'varchar(255)', to: 'text' } },
        { name: 'created_at', type: 'timestamp', pk: false, fk: null, nullable: true, diff: 'unchanged' },
        { name: 'age', type: 'integer', pk: false, fk: null, nullable: true, diff: 'added' },
      ],
    },
    {
      id: 'public.orders',
      table: 'orders',
      diff: 'unchanged',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'user_id', type: 'integer', pk: false, fk: 'users', nullable: false, diff: 'unchanged' },
        { name: 'amount', type: 'numeric(10,2)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
        { name: 'status', type: 'varchar(20)', pk: false, fk: null, nullable: false, diff: 'unchanged' },
      ],
    },
  ],
  edges: [
    { id: 'fk_orders_user_id', source: 'public.orders', target: 'public.users', sourceColumn: 'user_id', targetColumn: 'id', diff: 'unchanged' },
  ],
};

const MOCK_DIFF: SchemaDiff = { before: MOCK_BEFORE, after: MOCK_AFTER };

const NODE_TYPES = { tableNode: TableNode };

// 열린 사이드시트 폭 보정 고정상수 (좌 SqlSheet / 우 RiskSheet, px)
const SHEET_WIDTH = 360;

// ── 변경노드 fitView 카메라 연출 (preview 진입 시) ──
// 변경노드(diff!=='unchanged') 집합으로 fitView ease pan.
// 열린 시트 폭(360px)만큼 좌/우 padding을 px 보정 — 시트가 캔버스를 덮어도
// 변경노드가 가려지지 않도록 뷰포트 안쪽으로 띄움. dagre 좌표 불변(뷰포트만 조정).
function useChangedNodesFitView(
  graph: SchemaGraph | undefined,
  sqlSheetOpen: boolean,
  riskSheetOpen: boolean,
) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!graph) return;
    const changedIds = graph.nodes
      .filter((n) => n.diff !== 'unchanged')
      .map((n) => ({ id: n.id }));
    fitView({
      nodes: changedIds.length > 0 ? changedIds : undefined,
      duration: 400,
      minZoom: 0.4,
      // 시트가 가리는 폭만큼 해당 변을 더 띄움(기본 64px + 시트 360px)
      padding: {
        top: 64,
        bottom: 64,
        left: sqlSheetOpen ? SHEET_WIDTH + 64 : 64,
        right: riskSheetOpen ? SHEET_WIDTH + 64 : 64,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, sqlSheetOpen, riskSheetOpen, fitView]);
}

// 위험 테이블 노드에 위험색 ring 주입(critical=error, warning=warning). dagre·data 불변 — node.style만 덧입힘.
// node.style은 xyflow 래퍼(.react-flow__node)에 적용돼 TableNode 인라인 diff 보더를 덮음 → 위험 > diff 우선순위 구현.
function applyRisk(nodes: Node[], riskMap: RiskMap): Node[] {
  if (!riskMap || Object.keys(riskMap).length === 0) return nodes;
  return nodes.map((node) => {
    const table = (node.data as unknown as NodeDef | undefined)?.table;
    const level = table ? riskMap[table] : undefined;
    if (!level) return node;
    const color = level === 'critical' ? 'var(--color-error)' : 'var(--color-warning)';
    const glow = level === 'critical' ? 'var(--color-error-glow)' : 'var(--color-warning-glow)';
    return {
      ...node,
      style: {
        ...node.style,
        border: `2px solid ${color}`,
        boxShadow: `0 0 0 1px ${color}, 0 0 16px 2px ${glow}, var(--shadow-card)`,
        borderRadius: 'var(--radius-md)',
        opacity: 1, // 위험 노드는 dim 금지
      },
    };
  });
}

// 위험카드 hover 시 대응 노드에 강조 ring 주입. dagre 좌표·data 불변 — node.style만 덧입힘.
// node.data.table(NodeDef)이 highlightTable과 일치하면 accent ring + 살짝 띄움.
function applyHighlight(nodes: Node[], highlightTable: string | null | undefined): Node[] {
  if (!highlightTable) return nodes;
  return nodes.map((node) => {
    const table = (node.data as unknown as NodeDef | undefined)?.table;
    if (table !== highlightTable) return node;
    return {
      ...node,
      style: {
        ...node.style,
        boxShadow: 'var(--shadow-focus)',
        borderRadius: 'var(--radius-md)',
        zIndex: 10,
      },
    };
  });
}

// ── 단일 패널 (hook은 항상 최상위에서 호출) ──
interface PanelProps {
  graph: SchemaGraph;
  label: string;
  onMove?: OnMove;
  highlightTable?: string | null;
  riskMap?: RiskMap;
}

function ErdPanel({ graph, label, onMove, highlightTable, riskMap = {} }: PanelProps) {
  const { nodes: rawNodes, edges } = useErdLayout(graph);
  // 합성 순서 고정: 위험 ring → hover focus-ring 덮어쓰기. (위험 > diff, hover > 위험)
  const nodes = applyHighlight(applyRisk(rawNodes, riskMap), highlightTable);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div
        style={{
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* 각 패널을 독립 Provider로 — Side-by-side 두 ReactFlow가 store를 공유하면
            한쪽(After) 노드가 양쪽에 그려지는 충돌 발생. Provider 분리로 Before/After 격리. */}
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            onMove={onMove}
            style={{ background: 'var(--bg-primary)' }}
          >
            <Background color="var(--border-subtle)" gap={20} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

// ── side-by-side: 좌 before / 우 after ──
function SideBySideView({
  diff,
  highlightTable,
  riskMap,
}: {
  diff: SchemaDiff;
  highlightTable?: string | null;
  riskMap?: RiskMap;
}) {
  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, minHeight: 0 }}>
      <ErdPanel graph={diff.before} label="Before" highlightTable={highlightTable} riskMap={riskMap} />
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <ErdPanel graph={diff.after} label="After" highlightTable={highlightTable} riskMap={riskMap} />
    </div>
  );
}

// ── overlay: after 그래프에 diff 색상만 ──
function OverlayView({
  diff,
  sqlSheetOpen,
  riskSheetOpen,
  highlightTable,
  riskMap = {},
}: {
  diff: SchemaDiff;
  sqlSheetOpen: boolean;
  riskSheetOpen: boolean;
  highlightTable?: string | null;
  riskMap?: RiskMap;
}) {
  const { nodes: rawNodes, edges } = useErdLayout(diff.after);
  const nodes = applyHighlight(applyRisk(rawNodes, riskMap), highlightTable);
  useChangedNodesFitView(diff.after, sqlSheetOpen, riskSheetOpen);
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-primary)' }}
      >
        <Background color="var(--border-subtle)" gap={20} />
      </ReactFlow>
    </div>
  );
}

// ── 단일 그래프 (diff 없음) ──
function SingleGraphView({
  graph,
  highlightTable,
  riskMap = {},
}: {
  graph: SchemaGraph;
  highlightTable?: string | null;
  riskMap?: RiskMap;
}) {
  const { nodes: rawNodes, edges } = useErdLayout(graph);
  const nodes = applyHighlight(applyRisk(rawNodes, riskMap), highlightTable);
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-primary)' }}
      >
        <Background color="var(--border-subtle)" gap={20} />
      </ReactFlow>
    </div>
  );
}

// ── 컨테이너 ──
export interface ErdDiffViewerProps {
  diff?: SchemaDiff;
  graph?: SchemaGraph;
  // 모드 상태는 상위(DiffControls)로 lift-up — value+onChange로 외부 제어
  mode?: 'side-by-side' | 'overlay';
  onModeChange?: (mode: 'side-by-side' | 'overlay') => void;
  // fitView padding 보정용 사이드시트 열림 여부
  sqlSheetOpen?: boolean;
  riskSheetOpen?: boolean;
  // 위험카드 hover 시 강조할 테이블명(RiskSheet → 노드 ring)
  highlightTable?: string | null;
  // 위험 테이블 노드 강조용(table → 'critical'|'warning'). 기본 {}
  riskMap?: RiskMap;
}

function ErdDiffViewerInner({
  diff,
  graph,
  mode = 'side-by-side',
  sqlSheetOpen = false,
  riskSheetOpen = false,
  highlightTable = null,
  riskMap = {},
}: ErdDiffViewerProps) {
  // 단일 그래프 모드 (diff 없음) — idle/applied.
  // SingleGraphView가 flex:1로 높이를 받으려면 부모가 flex 컨테이너여야 함(react-flow는
  // 부모 height가 0이면 "parent container needs width/height" 에러로 렌더 안 됨).
  if (!diff && graph) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <SingleGraphView graph={graph} highlightTable={highlightTable} riskMap={riskMap} />
      </div>
    );
  }

  const activeDiff = diff ?? MOCK_DIFF;

  // DiffLegend·모드토글 UI는 DiffControls로 이동 — 여기서는 뷰만 렌더
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {mode === 'side-by-side' ? (
        <SideBySideView diff={activeDiff} highlightTable={highlightTable} riskMap={riskMap} />
      ) : (
        <OverlayView
          diff={activeDiff}
          sqlSheetOpen={sqlSheetOpen}
          riskSheetOpen={riskSheetOpen}
          highlightTable={highlightTable}
          riskMap={riskMap}
        />
      )}
    </div>
  );
}

export default function ErdDiffViewer(props: ErdDiffViewerProps) {
  // 위험맵을 Context로 공급 → TableNode 헤더 위험 배지 조회.
  return (
    <RiskMapContext.Provider value={props.riskMap ?? {}}>
      <ReactFlowProvider>
        <ErdDiffViewerInner {...props} />
      </ReactFlowProvider>
    </RiskMapContext.Provider>
  );
}
