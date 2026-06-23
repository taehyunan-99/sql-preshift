'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePipelineStore } from '../store/pipeline';
import { fetchSchemaGraph, type SchemaGraph } from '../lib/api';
import { buildRiskMap, type RiskMap } from '../lib/riskMap';
import InputPanel from '../components/InputPanel';
import SqlDraftPanel from '../components/SqlDraftPanel';
import ErdDiffViewer from '../components/erd/ErdDiffViewer';
import CompletedBar from '../components/CompletedBar';
import AuditDrawer from '../components/AuditDrawer';
import StageBadge from '../components/StageBadge';
import DiffControls, { type DiffMode } from '../components/DiffControls';

// 모든 floating 레이어는 항상 마운트하고 stage에 따라 CSS reveal(opacity/transform/
// visibility/pointer-events)로 등장·퇴장. 언마운트 금지(Monaco/react-flow 재초기화 회피).
// RiskSheet만 risks===0 예외(컴포넌트 자체 미렌더).

// reveal 헬퍼: visible=true면 표시, false면 투명+클릭불가(+8px translateY).
function reveal(visible: boolean): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(8px)',
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
    transition: 'opacity var(--transition-base), transform var(--transition-base)',
  };
}

export default function Home() {
  const { stage, analyzeResult } = usePipelineStore();

  // ERD mode 상태 lift-up — DiffControls·ErdDiffViewer가 공유.
  const [mode, setMode] = useState<DiffMode>('side-by-side');
  // SqlDraft 사이드시트 열림 상태(fitView padding 보정용).
  const [sqlSheetOpen, setSqlSheetOpen] = useState(false);
  // idle/applied SingleGraphView용 현재 스키마 그래프.
  const [graph, setGraph] = useState<SchemaGraph | undefined>(undefined);

  // 현재 스키마 그래프 로드(idle/applied single 뷰 데이터 출처).
  // applied 진입 시 재로드 — Apply All로 누적 변경이 실DB에 반영됐으므로 ERD를 갱신한다.
  useEffect(() => {
    if (stage !== 'idle' && stage !== 'applied') return;
    let alive = true;
    fetchSchemaGraph()
      .then((g) => {
        if (alive) setGraph(g);
      })
      .catch(() => {
        // 백엔드 미연동 시 ErdDiffViewer 내부 MOCK 폴백에 위임.
      });
    return () => {
      alive = false;
    };
  }, [stage]);

  const isDiffStage = stage === 'preview' || stage === 'applying';
  const isResultStage = isDiffStage || stage === 'applied';

  // 위험 테이블 노드 강조용 맵(table→level). 결과 stage에서 ERD 노드에 붉은/노란 강조로 반영.
  const riskMap: RiskMap = useMemo(() => {
    if (!analyzeResult || analyzeResult.risks.length === 0) return {};
    return buildRiskMap(analyzeResult.risks);
  }, [analyzeResult]);

  // ErdCanvas 데이터: preview/applying=diff, idle/applied=single graph.
  const erdDiff = isDiffStage ? analyzeResult?.schemaDiff : undefined;
  const erdGraph = isDiffStage ? undefined : graph;

  // analyzing/applying dim 오버레이.
  const showDim = stage === 'analyzing' || stage === 'applying';
  const dimLabel = stage === 'applying' ? 'Applying…' : 'Analyzing…';

  return (
    <main
      style={{
        position: 'relative',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Layer0: ERD 캔버스 — 풀블리드 */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ErdDiffViewer
          diff={erdDiff}
          graph={erdGraph}
          mode={mode}
          onModeChange={setMode}
          sqlSheetOpen={sqlSheetOpen}
          riskSheetOpen={false}
          riskMap={isResultStage ? riskMap : {}}
        />
      </div>

      {/* analyzing/applying dim 오버레이 + 중앙 라벨 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--bg-scrim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          opacity: showDim ? 1 : 0,
          visibility: showDim ? 'visible' : 'hidden',
          pointerEvents: showDim ? 'auto' : 'none',
          transition: 'opacity var(--transition-base)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-md)',
            color: 'var(--text-primary)',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          {dimLabel}
        </span>
      </div>

      {/* Layer1: TopBar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0 var(--space-4)',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          zIndex: 40,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>SQLPreShift</span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
          Safe schema migration control
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <StageBadge />
          <AuditButton />
        </div>
      </div>

      {/* Layer3: DiffControls — preview/applied만. self-position(top:56 right:16)이므로
          래퍼 없이 reveal 스타일을 직접 주입(이중 absolute 방지). */}
      <DiffControls value={mode} onChange={setMode} style={reveal(isResultStage)} />

      {/* Layer4: SqlSheet — preview/applied만. 컴포넌트가 self-position. */}
      <div
        style={{
          ...reveal(isResultStage),
          // self-position(absolute) 컴포넌트라 래퍼는 reveal만 담당.
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: isResultStage ? 'auto' : 'none' }}>
          <SqlDraftPanel
            open={sqlSheetOpen}
            onToggle={() => setSqlSheetOpen((v) => !v)}
          />
        </div>
      </div>

      {/* 위험은 오른쪽 시트 대신 ERD 노드 붉은/노란 강조(riskMap)로 표시하고,
          critical은 InputPanel의 경고 모달로 알린다(별도 RiskSheet 제거). */}

      {/* Layer2: CommandBar(idle/analyzing/preview) — 하단 중앙. InputPanel은 self-width(720px)라
          래퍼 하나로 중앙 정렬 + reveal. preview에서도 노출돼 누적 dry-run 입력을 받고,
          누적 액션(pending·Undo·Cancel·Apply All)은 InputPanel 하단에 통합. applying/applied는 숨김. */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          zIndex: 36,
          transform: (stage === 'idle' || stage === 'analyzing' || stage === 'preview')
            ? 'translate(-50%, 0)'
            : 'translate(-50%, 8px)',
          opacity: (stage === 'idle' || stage === 'analyzing' || stage === 'preview') ? 1 : 0,
          visibility: (stage === 'idle' || stage === 'analyzing' || stage === 'preview') ? 'visible' : 'hidden',
          pointerEvents: (stage === 'idle' || stage === 'analyzing' || stage === 'preview') ? 'auto' : 'none',
          transition: 'opacity var(--transition-base), transform var(--transition-base)',
        }}
      >
        <InputPanel />
      </div>

      {/* 누적 dry-run 액션(pending·Undo·Cancel·Apply All)은 InputPanel 하단에 통합됨.
          CompletedBar는 자체 stage 가드 + self-position. 항상 마운트. */}
      <CompletedBar />

      {/* Layer7: AuditDrawer */}
      <AuditDrawer />

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition-property: opacity !important;
          }
        }
      `}</style>
    </main>
  );
}

// 감사이력 버튼 — TopBar로 이전(StageDevBar에서 분리).
function AuditButton() {
  const openAudit = usePipelineStore((s) => s.openAudit);
  return (
    <button
      onClick={openAudit}
      style={{
        padding: '5px 12px',
        fontSize: 'var(--font-size-xs)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      History
    </button>
  );
}
