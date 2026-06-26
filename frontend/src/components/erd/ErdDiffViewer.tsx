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
import EdgeGlowOverlay from './EdgeGlowOverlay';
import { useErdLayout } from './useErdLayout';
import {
  computeUnionPositions,
  collectNHop,
  filterGraphByIds,
  type PositionMap,
} from '../../lib/erd-layout';
import { useErdLabStore } from '../../store/erdLab';
import type { SchemaGraph, SchemaDiff, NodeDef } from '../../lib/api';
import type { RiskMap } from '../../lib/riskMap';

// 위험맵(table→level)을 TableNode 헤더 배지까지 전달하는 Context.
// xyflow는 nodeTypes 컴포넌트에 node.data만 넘기므로(data·layout 불변 제약),
// 위험 level은 Context가 유일한 비침습 경로.
const RiskMapContext = createContext<RiskMap>({});
export const useRiskMap = () => useContext(RiskMapContext);

// 연결됐으나 그래프 로드 전/빈 DB일 때 표시할 빈 그래프 — MOCK 은폐 대신 실제 빈 상태.
const EMPTY_GRAPH: SchemaGraph = { nodes: [], edges: [] };

// n홉 기본값 — 입력이 닿는 테이블 기준 양방향 FK 2단계. 토글로 3까지.
export const DEFAULT_HOPS = 2;

// 변경된(diff!=='unchanged') 노드 id 목록 — n홉 seed.
function changedNodeIds(graph: SchemaGraph): string[] {
  return graph.nodes.filter((n) => n.diff !== 'unchanged').map((n) => n.id);
}

// 부분집합 계산 결과 — 필터된 id 집합과 카운터용 노드 수.
export interface SubsetInfo {
  ids: Set<string>;
  shownCount: number;
  totalCount: number;
}

// 합친 seed(여러 그래프의 변경 노드 합집합)로 n홉 부분집합 id를 구한다.
// FK 인접은 가장 풍부한 그래프(보통 cumulativeAfter/after)의 edges로 잡는다.
function computeSubset(
  graphs: SchemaGraph[],
  edgeGraph: SchemaGraph,
  hops: number,
): SubsetInfo {
  const seed = Array.from(new Set(graphs.flatMap(changedNodeIds)));
  const ids = collectNHop(edgeGraph.edges, seed, hops);
  const totalIds = new Set(graphs.flatMap((g) => g.nodes.map((n) => n.id)));
  return { ids, shownCount: ids.size, totalCount: totalIds.size };
}

// Locate 대상 테이블의 노드 id를 subset에 추가 — subset 밖 테이블도 필터된 그래프에 남겨
// fitView가 유효하고 화면에도 보이게 한다. highlightTable이 없거나 이미 포함이면 그대로.
function withLocateTable(
  ids: Set<string>,
  graph: SchemaGraph,
  highlightTable: string | null | undefined,
): Set<string> {
  if (!highlightTable) return ids;
  const node = graph.nodes.find((n) => n.table === highlightTable);
  if (!node || ids.has(node.id)) return ids;
  const next = new Set(ids);
  next.add(node.id);
  return next;
}

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

// Diagnostics "Locate in ERD" — highlightTable이 바뀌면 그 노드로 카메라 이동(fitView).
// table명 → node id 매핑은 graph로(node.data.table 매칭). nodes를 의존에 넣지 않는 건
// 매 레이아웃마다 fitView가 튀는 걸 막기 위함 — highlightTable 변경 때만 이동.
// fallbackGraph: n홉 subset에 그 테이블이 없을 때(필터돼 사라짐) 원본 전체 그래프에서 좌표를 찾는다.
// (subset이 좁아 대상이 빠지면 fitView 노드가 없어 카메라가 안 움직이던 버그 방지.)
// locateNonce: Locate 클릭마다 증가하는 카운터. effect deps에 넣어 "같은 테이블 재클릭"에도
// 매번 fitView가 발화하게 한다(highlightTable 값만으론 동일 값 재set이 effect를 안 깨움).
function useLocateOnHighlight(
  graph: SchemaGraph,
  highlightTable: string | null | undefined,
  locateNonce: number,
  fallbackGraph?: SchemaGraph,
) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!highlightTable) return;
    const node =
      graph.nodes.find((n) => n.table === highlightTable) ??
      fallbackGraph?.nodes.find((n) => n.table === highlightTable);
    if (!node) return;
    fitView({
      nodes: [{ id: node.id }],
      duration: 500,
      minZoom: 0.6,
      maxZoom: MAX_ZOOM,
      padding: 0.35,
    });
    // locateNonce가 deps에 있어 동일 테이블 재클릭에도 재발화. graph는 의도적으로 제외
    // (레이아웃 변동마다 카메라가 튀지 않도록 — locate 클릭(nonce 변경)에만 반응).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateNonce, fitView]);
}

// fitView는 hook이라 ReactFlow 자식 컴포넌트로 호출해야 한다(Provider 컨텍스트 안). 렌더는 없음.
function PanelLocator({
  graph,
  highlightTable,
  locateNonce,
  fallbackGraph,
}: {
  graph: SchemaGraph;
  highlightTable: string | null | undefined;
  locateNonce: number;
  fallbackGraph?: SchemaGraph;
}) {
  useLocateOnHighlight(graph, highlightTable, locateNonce, fallbackGraph);
  return null;
}

// 위험 강조는 TableNode가 Context(useRiskMap)로 기존 diff 시각언어(ringByVariant)를 써서 그린다.
// node.style 직접 주입(사각 border)은 카드 디자인과 따로 놀아 제거했다.

// Locate/hover 강조는 "카메라 이동"으로만 표현한다(useLocateOnHighlight).
// 과거엔 대상 노드에 boxShadow ring을 덧입혔으나, 카드 디자인 위에 사각 테두리가 겹쳐
// "깨진 테두리"로 보였다 → ring 제거. highlightTable은 카메라 이동 트리거로만 쓰인다.

// ── 단일 패널 (hook은 항상 최상위에서 호출) ──
interface PanelProps {
  graph: SchemaGraph;
  label: string;
  highlightTable?: string | null;
  locateNonce?: number;
  riskMap?: RiskMap;
  // Split뷰 pan/zoom 동기화: 공유 viewport(있으면 controlled) + 변경 콜백.
  viewport?: Viewport;
  onViewportChange?: (vp: Viewport) => void;
  // Split뷰 공유 좌표(union 레이아웃) — before/after가 같은 테이블을 동일 위치에 그린다.
  positions?: PositionMap;
  // Locate 카메라 이동 담당 패널인지(Split은 after만 — fitView가 onViewportChange로 before에 전파).
  locate?: boolean;
  // n홉 subset에 없는 테이블 Locate 시 좌표를 찾을 원본 전체 그래프(After 패널만).
  fullGraph?: SchemaGraph;
}

function ErdPanel({
  graph,
  label,
  highlightTable,
  locateNonce = 0,
  riskMap = {},
  viewport,
  onViewportChange,
  positions,
  locate = false,
  fullGraph,
}: PanelProps) {
  const { nodes, edges } = useErdLayout(graph, positions);
  // 노드 hover → 연결 엣지 강조(ErdRelationEdge가 store.hoveredNode 구독). 핸들러는 안정 참조.
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  // 위험 강조는 TableNode가 Context(riskMap)로 기존 diff 시각언어(ringByVariant)를 써서 그린다.
  // highlightTable은 PanelLocator의 카메라 이동에만 쓰인다(노드 ring 주입 없음).
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
          {locate && (
            // Locate(명시적 버튼 클릭)만 카메라를 이동. 새 쿼리 입력 시 자동 이동은 하지 않는다.
            <PanelLocator
              graph={graph}
              highlightTable={highlightTable}
              locateNonce={locateNonce}
              fallbackGraph={fullGraph}
            />
          )}
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
            {/* glow는 변경 결과 패널(After=locate)에만 — Before(baseline)엔 빛 없음. */}
            {locate && <EdgeGlowOverlay />}
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
  locateNonce = 0,
  riskMap,
  hops,
  showAll,
  onSubset,
}: {
  diff: SchemaDiff;
  highlightTable?: string | null;
  locateNonce?: number;
  riskMap?: RiskMap;
  hops: number;
  showAll: boolean;
  onSubset?: (info: SubsetInfo) => void;
}) {
  // undefined = 최초 진입(빌트인 fitView로 1회 자동정렬). 첫 pan/zoom 후 controlled로 전환돼
  // 그 위치를 유지한다. 새 분석이 와도 viewport를 풀지 않으므로 사용자가 보던 화면이 고정된다
  // (자동 카메라 이동 없음 — 변경 테이블로 가려면 진단 패널 Locate 버튼).
  const [viewport, setViewport] = useState<Viewport | undefined>(undefined);
  // n홉 부분집합 — before/after/cumulativeAfter의 변경 노드를 "합친 seed"로 동일 부분집합을
  // 양 패널에 적용한다. 좌표 괴리를 막으려면 양쪽이 반드시 같은 id 집합이어야 한다.
  // useMemo는 순수 계산만(렌더 중 부모 setState 금지 — onSubset은 아래 useEffect에서).
  const { beforeGraph, afterGraph, subsetInfo } = useMemo(() => {
    const seedGraphs = [diff.before, diff.after, ...(diff.cumulativeAfter ? [diff.cumulativeAfter] : [])];
    const info = computeSubset(seedGraphs, diff.after, hops);
    const seedEmpty = seedGraphs.flatMap(changedNodeIds).length === 0;
    if (showAll || seedEmpty) {
      // 전체 표시 — 카운터는 전체 수, ids는 빈 집합(필터 안 함).
      const fullInfo: SubsetInfo = { ids: new Set(), shownCount: info.totalCount, totalCount: info.totalCount };
      return { beforeGraph: diff.before, afterGraph: diff.after, subsetInfo: fullInfo };
    }
    // Locate 대상은 subset 밖이어도 강제 포함 — 안 그러면 필터된 그래프에 노드가 없어
    // fitView가 무효가 되고(=카메라 안 움직임), 화면에도 안 보인다.
    const ids = withLocateTable(info.ids, diff.after, highlightTable);
    return {
      beforeGraph: filterGraphByIds(diff.before, ids),
      afterGraph: filterGraphByIds(diff.after, ids),
      subsetInfo: info,
    };
  }, [diff.before, diff.after, diff.cumulativeAfter, hops, showAll, highlightTable]);
  // 카운터 lift-up은 effect에서(OverlayView와 동일 패턴) — 렌더 중 부모 업데이트 경고 방지.
  useEffect(() => {
    onSubset?.(subsetInfo);
  }, [subsetInfo, onSubset]);
  // before/after 합집합으로 좌표를 한 번 계산해 두 패널이 공유 → 같은 테이블 동일 위치.
  // 필터된 부분집합으로 재계산해야 한쪽에만 있는 좌표 참조 괴리가 안 생긴다.
  const positions = useMemo(
    () => computeUnionPositions([beforeGraph, afterGraph]),
    [beforeGraph, afterGraph],
  );
  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, minHeight: 0 }}>
      {/* before(현재 baseline)엔 위험 강조 안 함 — 위험은 적용 결과(after)에만 */}
      <ErdPanel
        graph={beforeGraph}
        label="Before"
        highlightTable={highlightTable}
        riskMap={{}}
        viewport={viewport}
        onViewportChange={setViewport}
        positions={positions}
      />
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <ErdPanel
        graph={afterGraph}
        label="After"
        highlightTable={highlightTable}
        locateNonce={locateNonce}
        riskMap={riskMap}
        viewport={viewport}
        onViewportChange={setViewport}
        positions={positions}
        locate
        fullGraph={diff.after}
      />
    </div>
  );
}

// ── overlay(Unified): 누적 전체 그래프에 diff 색상. 누적 dry-run이면 cumulativeAfter,
//    아니면 after를 쓴다 → Unified는 "지금까지 쌓은 전체", Split은 직전 1개(선명한 비교). ──
function OverlayView({
  diff,
  highlightTable,
  locateNonce = 0,
  riskMap = {},
  hops,
  showAll,
  onSubset,
}: {
  diff: SchemaDiff;
  highlightTable?: string | null;
  locateNonce?: number;
  riskMap?: RiskMap;
  hops: number;
  showAll: boolean;
  onSubset?: (info: SubsetInfo) => void;
}) {
  const fullGraph = diff.cumulativeAfter ?? diff.after;
  // n홉 부분집합 — seed(변경 노드)가 없거나 showAll이면 전체 그래프.
  const { overlayGraph, subset } = useMemo(() => {
    const info = computeSubset([fullGraph], fullGraph, hops);
    const seedEmpty = changedNodeIds(fullGraph).length === 0;
    // Locate 대상은 subset 밖이어도 강제 포함(필터된 그래프에 노드를 남겨 fitView 유효).
    const ids = withLocateTable(info.ids, fullGraph, highlightTable);
    const graph = showAll || seedEmpty ? fullGraph : filterGraphByIds(fullGraph, ids);
    return { overlayGraph: graph, subset: info };
  }, [fullGraph, hops, showAll, highlightTable]);
  // 카운터 lift-up — showAll/seedEmpty면 전체를 보여주므로 shownCount=totalCount.
  useEffect(() => {
    onSubset?.(
      showAll || changedNodeIds(fullGraph).length === 0
        ? { ids: new Set(), shownCount: subset.totalCount, totalCount: subset.totalCount }
        : subset,
    );
  }, [subset, showAll, fullGraph, onSubset]);
  const { nodes, edges } = useErdLayout(overlayGraph);
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <PanelLocator graph={overlayGraph} highlightTable={highlightTable} locateNonce={locateNonce} fallbackGraph={fullGraph} />
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
        <EdgeGlowOverlay />
      </ReactFlow>
    </div>
  );
}

// ── 단일 그래프 (diff 없음) ──
function SingleGraphView({
  graph,
  highlightTable,
  locateNonce = 0,
  riskMap = {},
}: {
  graph: SchemaGraph;
  highlightTable?: string | null;
  locateNonce?: number;
  riskMap?: RiskMap;
}) {
  const { nodes, edges } = useErdLayout(graph);
  const { onNodeMouseEnter, onNodeMouseLeave } = useHoverHandlers();
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <PanelLocator graph={graph} highlightTable={highlightTable} locateNonce={locateNonce} />
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
        <EdgeGlowOverlay />
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
  // Locate 대상 테이블명(Diagnostics "ERD에서 찾기" → 카메라 이동)
  highlightTable?: string | null;
  // Locate 발화 카운터 — 같은 테이블 재클릭에도 매번 fitView가 돌도록.
  locateNonce?: number;
  // 위험 테이블 노드 강조용(table → 'critical'|'warning'). 기본 {}
  riskMap?: RiskMap;
  // n홉 부분집합 제어 — 입력이 닿는 테이블 기준 양방향 FK n홉만 그린다(큰 DB 성능).
  hops?: number;
  showAll?: boolean;
  // 부분집합 카운터 lift-up(DiffControls의 "Showing X of Y" 표시용).
  onSubset?: (info: SubsetInfo) => void;
}

function ErdDiffViewerInner({
  diff,
  graph,
  mode = 'side-by-side',
  highlightTable = null,
  locateNonce = 0,
  riskMap = {},
  hops = DEFAULT_HOPS,
  showAll = false,
  onSubset,
}: ErdDiffViewerProps) {
  // 단일 그래프 모드 (diff 없음) — idle/applied.
  // SingleGraphView가 flex:1로 높이를 받으려면 부모가 flex 컨테이너여야 함(react-flow는
  // 부모 height가 0이면 "parent container needs width/height" 에러로 렌더 안 됨).
  // diff 없으면(idle/applied) 단일 그래프 — 연결됐으나 그래프가 아직/비었으면 빈 그래프.
  // MOCK 폴백 제거: 게이트 통과 후엔 항상 실제 DB 기준이므로 가짜 ERD로 은폐하지 않는다.
  if (!diff) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <SingleGraphView graph={graph ?? EMPTY_GRAPH} highlightTable={highlightTable} locateNonce={locateNonce} riskMap={riskMap} />
      </div>
    );
  }

  const activeDiff = diff;

  // DiffLegend·모드토글 UI는 DiffControls로 이동 — 여기서는 뷰만 렌더
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {mode === 'side-by-side' ? (
        <SideBySideView
          diff={activeDiff}
          highlightTable={highlightTable}
          locateNonce={locateNonce}
          riskMap={riskMap}
          hops={hops}
          showAll={showAll}
          onSubset={onSubset}
        />
      ) : (
        <OverlayView
          diff={activeDiff}
          highlightTable={highlightTable}
          locateNonce={locateNonce}
          riskMap={riskMap}
          hops={hops}
          showAll={showAll}
          onSubset={onSubset}
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
