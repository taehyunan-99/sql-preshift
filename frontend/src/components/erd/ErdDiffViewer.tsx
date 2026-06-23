'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNode from './TableNode';
import ErdRelationEdge from './ErdRelationEdge';
import { useErdLayout } from './useErdLayout';
import { computeUnionPositions, type PositionMap } from '../../lib/erd-layout';
import { useErdLabStore } from '../../store/erdLab';
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
const EDGE_TYPES = { relationEdge: ErdRelationEdge };

// maxZoom — 확대 상한. WebKit은 scale>1 viewport 레이어를 흐리게 래스터할 수 있어(#27684)
// 1.0이 가장 안전하지만 그러면 작은 그래프가 너무 작다. 노드 root의 motion.div를 제거해 노드가
// viewport 단일 레이어를 타게 됐으므로(자체 합성 레이어 아님) 1.4 정도는 흐림 위험이 낮다.
// (흐림 재발 시 1.2 → 1.0으로 낮추면 됨.)
const MAX_ZOOM = 1.4;
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: MAX_ZOOM };

// 노드 hover 핸들러를 안정 참조로 — 매 렌더 새 함수면 ReactFlow가 props 변경으로 인식.
// onNodeMouseEnter/Leave가 store.hoveredNode만 갱신(엣지 강조용)하고 viewport는 안 건드린다.
function useHoverHandlers() {
  const setHoveredNode = useErdLabStore((s) => s.setHoveredNode);
  const onNodeMouseEnter = useCallback(
    (_: unknown, n: Node) => setHoveredNode(n.id),
    [setHoveredNode],
  );
  const onNodeMouseLeave = useCallback(() => setHoveredNode(null), [setHoveredNode]);
  return { onNodeMouseEnter, onNodeMouseLeave };
}

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
      maxZoom: MAX_ZOOM, // 확대 상한 — WebKit scale 흐림(#27684) 억제

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

// 위험 강조는 TableNode가 Context(useRiskMap)로 기존 diff 시각언어(ringByVariant)를 써서 그린다.
// node.style 직접 주입(사각 border)은 카드 디자인과 따로 놀아 제거했다.

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
  highlightTable?: string | null;
  riskMap?: RiskMap;
  // Split뷰 pan/zoom 동기화: 공유 viewport(있으면 controlled) + 변경 콜백.
  viewport?: Viewport;
  onViewportChange?: (vp: Viewport) => void;
  // Split뷰 공유 좌표(union 레이아웃) — before/after가 같은 테이블을 동일 위치에 그린다.
  positions?: PositionMap;
}

function ErdPanel({
  graph,
  label,
  highlightTable,
  riskMap = {},
  viewport,
  onViewportChange,
  positions,
}: PanelProps) {
  const { nodes: rawNodes, edges } = useErdLayout(graph, positions);
  // 노드 hover → 연결 엣지 강조(ErdRelationEdge가 store.hoveredNode 구독). 핸들러는 안정 참조.
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  // 위험 강조는 TableNode가 Context(riskMap)로 기존 diff 시각언어(ringByVariant)를 써서 그린다.
  // 여기선 hover focus-ring만 node.style로 덧입힘(useMemo — hover는 store 구독이라 입력 아님).
  const nodes = useMemo(
    () => applyHighlight(rawNodes, highlightTable),
    [rawNodes, highlightTable],
  );
  return (
    // 패널별 riskMap을 자체 Provider로 — before 패널은 {} 받아 강조 없음, after만 강조.
    <RiskMapContext.Provider value={riskMap}>
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
            edgeTypes={EDGE_TYPES}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            // viewport 미설정(초기)일 땐 fitView로 자동 정렬, 첫 이동 후부터 controlled 동기화.
            fitView={!viewport}
            fitViewOptions={FIT_VIEW_OPTIONS}
            maxZoom={MAX_ZOOM}
            viewport={viewport}
            onViewportChange={onViewportChange}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--bg-primary)' }}
          >
            <Background color="var(--border-subtle)" gap={20} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
    </RiskMapContext.Provider>
  );
}

// ── side-by-side: 좌 before / 우 after ──
// 두 패널이 공유 viewport state를 controlled로 보므로 pan/zoom이 동기화된다.
// 한쪽 조작 → onViewportChange → state 갱신 → 양쪽 viewport 동일 → 미러링.
function SideBySideView({
  diff,
  highlightTable,
  riskMap,
}: {
  diff: SchemaDiff;
  highlightTable?: string | null;
  riskMap?: RiskMap;
}) {
  // undefined = 초기(각 패널 fitView 자동정렬). 첫 이동 후 controlled로 전환돼 동기화.
  const [viewport, setViewport] = useState<Viewport | undefined>(undefined);
  // before/after 합집합으로 좌표를 한 번 계산해 두 패널이 공유 → 같은 테이블 동일 위치.
  const positions = useMemo(
    () => computeUnionPositions([diff.before, diff.after]),
    [diff.before, diff.after],
  );
  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, minHeight: 0 }}>
      {/* before(현재 baseline)엔 위험 강조 안 함 — 위험은 적용 결과(after)에만 */}
      <ErdPanel
        graph={diff.before}
        label="Before"
        highlightTable={highlightTable}
        riskMap={{}}
        viewport={viewport}
        onViewportChange={setViewport}
        positions={positions}
      />
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <ErdPanel
        graph={diff.after}
        label="After"
        highlightTable={highlightTable}
        riskMap={riskMap}
        viewport={viewport}
        onViewportChange={setViewport}
        positions={positions}
      />
    </div>
  );
}

// ── overlay(Unified): 누적 전체 그래프에 diff 색상. 누적 dry-run이면 cumulativeAfter,
//    아니면 after를 쓴다 → Unified는 "지금까지 쌓은 전체", Split은 직전 1개(선명한 비교). ──
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
  const overlayGraph = diff.cumulativeAfter ?? diff.after;
  const { nodes: rawNodes, edges } = useErdLayout(overlayGraph);
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  const nodes = useMemo(
    () => applyHighlight(rawNodes, highlightTable),
    [rawNodes, highlightTable],
  );
  useChangedNodesFitView(overlayGraph, sqlSheetOpen, riskSheetOpen);
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        maxZoom={MAX_ZOOM}
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
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  const nodes = useMemo(
    () => applyHighlight(rawNodes, highlightTable),
    [rawNodes, highlightTable],
  );
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        maxZoom={MAX_ZOOM}
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
