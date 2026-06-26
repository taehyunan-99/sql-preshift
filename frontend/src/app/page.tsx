'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePipelineStore } from '../store/pipeline';
import {
  disconnectDatabase,
  fetchSchemaGraph,
  getConnectionStatus,
  type ConnectionStatus,
  type SchemaGraph,
} from '../lib/api';
import { buildRiskMap, type RiskMap } from '../lib/riskMap';
import InputPanel from '../components/InputPanel';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import ErdDiffViewer from '../components/erd/ErdDiffViewer';
import CompletedBar from '../components/CompletedBar';
import AppliedToast from '../components/AppliedToast';
import AuditDrawer from '../components/AuditDrawer';
import StageBadge from '../components/StageBadge';
import StageProgress from '../components/StageProgress';
import LanguageToggle from '../components/LanguageToggle';
import ModelSettings from '../components/ModelSettings';
import DiffControls, { type DiffMode } from '../components/DiffControls';
import DatabaseConnect from '../components/DatabaseConnect';
import AppBackdrop from '../components/AppBackdrop';
import { DEFAULT_HOPS, type SubsetInfo } from '../components/erd/ErdDiffViewer';

// 전체 스키마를 그대로 그리면 무거울 수 있는 임계 테이블 수 — 넘으면 경고 후 진행.
const LARGE_SCHEMA_THRESHOLD = 200;

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
    // opacity는 페이드라 평이한 ease, 위치(transform)만 settle로 탄성 정착(D 일관 적용).
    transition: 'opacity var(--transition-base), transform var(--transition-settle-sm)',
  };
}

export default function Home() {
  const { stage, analyzeResult, connected, connectionEpoch, connectedDbname, language, setConnection } =
    usePipelineStore();

  // ERD mode 상태 lift-up — DiffControls·ErdDiffViewer가 공유.
  const [mode, setMode] = useState<DiffMode>('side-by-side');
  // 진단 사이드시트 열림 상태(좌측, fitView padding 보정용).
  const [panelOpen, setPanelOpen] = useState(false);
  // Diagnostics "Locate in ERD" → 해당 테이블로 카메라 이동.
  const [highlightTable, setHighlightTable] = useState<string | null>(null);
  // locate 발화 카운터 — 같은 테이블 재클릭에도 매번 fitView가 돌도록 nonce를 증가시킨다.
  // (highlightTable 값만으론 동일 테이블 재클릭 시 effect가 안 깨움.)
  const [locateNonce, setLocateNonce] = useState(0);
  // idle/applied SingleGraphView용 현재 스키마 그래프.
  const [graph, setGraph] = useState<SchemaGraph | undefined>(undefined);
  // 최초 연결 상태 조회 완료 여부 — 조회 전엔 게이트/메인 둘 다 안 띄움(깜빡임 방지).
  const [statusChecked, setStatusChecked] = useState(false);
  // 메인에서 DB 교체 모달 열림 여부.
  const [reconnectOpen, setReconnectOpen] = useState(false);
  // n홉 부분집합 제어 — preview/applying ERD에서 입력이 닿는 테이블 기준 n홉만 그린다.
  const [hops, setHops] = useState(DEFAULT_HOPS);
  const [showAll, setShowAll] = useState(false);
  const [subset, setSubset] = useState<SubsetInfo | null>(null);
  // idle 전체보기 옵트인 — 입력 전엔 빈 캔버스, 클릭 시 전체 스키마 ERD를 그린다.
  const [showFullSchema, setShowFullSchema] = useState(false);

  // 최초 로드 시 백엔드에 현재 연결 상태를 조회한다.
  useEffect(() => {
    let alive = true;
    getConnectionStatus()
      .then((s) => {
        if (!alive) return;
        setConnection({ connected: s.connected, host: s.host, dbname: s.dbname, epoch: s.epoch });
      })
      .catch(() => {
        // 백엔드 미기동 — 미연결로 간주(게이트 노출).
      })
      .finally(() => {
        if (alive) setStatusChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [setConnection]);

  const onConnected = (s: ConnectionStatus) => {
    setConnection({ connected: s.connected, host: s.host, dbname: s.dbname, epoch: s.epoch });
    setReconnectOpen(false);
  };

  // 연결 해제 → 미연결 상태로 store 갱신 → page가 온보딩 로비 게이트로 복귀(새로고침 불필요).
  const onDisconnect = async () => {
    try {
      const s = await disconnectDatabase();
      setConnection({ connected: s.connected, host: s.host, dbname: s.dbname, epoch: s.epoch });
      setReconnectOpen(false);
    } catch {
      // 실패해도 게이트는 안 띄움(연결 유지) — 조용히 무시(데모).
    }
  };

  // 현재 스키마 그래프 로드(idle/applied single 뷰 데이터 출처).
  // applied 진입 시 재로드 — Apply All로 누적 변경이 실DB에 반영됐으므로 ERD를 갱신한다.
  // connectionEpoch 의존 — DB 교체 시 새 DB 스키마로 갱신.
  useEffect(() => {
    if (!connected) return;
    if (stage !== 'idle' && stage !== 'applied') return;
    let alive = true;
    fetchSchemaGraph()
      .then((g) => {
        if (alive) setGraph(g);
      })
      .catch(() => {
        // 연결됐는데 그래프 로드 실패 — 빈 그래프 유지(MOCK 은폐 안 함).
      });
    return () => {
      alive = false;
    };
  }, [stage, connected, connectionEpoch]);

  const isDiffStage = stage === 'preview' || stage === 'applying';
  const isResultStage = isDiffStage || stage === 'applied';

  // 위험 테이블 노드 강조용 맵(table→level). 결과 stage에서 ERD 노드에 붉은/노란 강조로 반영.
  const riskMap: RiskMap = useMemo(() => {
    if (!analyzeResult || analyzeResult.risks.length === 0) return {};
    return buildRiskMap(analyzeResult.risks);
  }, [analyzeResult]);

  // ErdCanvas 데이터: preview/applying=diff, applied=single graph.
  // idle은 ERD를 그리지 않는다(빈 캔버스 + 중앙 입력창) — "View full schema" 옵트인 시에만 전체 표시.
  const erdDiff = isDiffStage ? analyzeResult?.schemaDiff : undefined;
  const showIdleSchema = stage === 'idle' && showFullSchema;
  const erdGraph = isDiffStage ? undefined : stage === 'applied' || showIdleSchema ? graph : undefined;
  // idle이고 전체보기 전이면 빈 초기화면(중앙 입력창 + 배경 placeholder).
  const isIdleBlank = stage === 'idle' && !showFullSchema;

  // 진단 소스 그래프 — 진단은 base에 박혀 before/현재 graph 양쪽에 보존된다.
  // preview/applying=schemaDiff.before(원본 실DB), idle/applied=현재 graph.
  const diagnosticsGraph = isDiffStage ? analyzeResult?.schemaDiff?.before : graph;

  // 새 분석(새 token)마다 Locate 잔재를 비운다 — 안 비우면 직전 "ERD에서 찾기"로 찍어둔
  // highlightTable로 카메라가 다시 튀어, 변경 테이블이 아닌 엉뚱한 곳으로 이동한다.
  // (분석 후엔 useChangedNodesFitView가 변경 테이블로 이동하는 게 맞다.)
  useEffect(() => {
    setHighlightTable(null);
  }, [analyzeResult?.token]);

  // "Locate in ERD" — 진단 패널에서 테이블 선택 시 ERD에서 강조(+카메라 이동은 ErdDiffViewer가
  // Locate 클릭 — 테이블 set + nonce 증가(같은 테이블 재클릭도 매번 fitView 발화).
  const onLocate = (table: string) => {
    setHighlightTable(table);
    setLocateNonce((n) => n + 1);
  };

  // analyzing/applying dim 오버레이.
  const showDim = stage === 'analyzing' || stage === 'applying';

  // 연결 상태 조회 전엔 빈 화면(게이트/메인 깜빡임 방지).
  if (!statusChecked) {
    return <main style={{ height: '100vh', background: 'var(--bg-primary)' }} />;
  }

  // 미연결이면 전체화면 온보딩 게이트 — 연결 성공해야 메인 진입.
  if (!connected) {
    return (
      <main style={{ position: 'relative', height: '100vh', background: 'var(--bg-primary)' }}>
        <DatabaseConnect onConnected={onConnected} />
      </main>
    );
  }

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
      {/* Layer0: ERD 캔버스 — 풀블리드.
          전체 스키마 보기 토글 시 ERD가 즉시 pop 하면 입력창 drop(settle)과 맞물려 어색하다.
          idle 전체보기에서만 입력창이 먼저 내려간 뒤(180ms delay) ERD가 천천히 떠오르도록
          지연 페이드인. preview/applied 등 다른 stage에선 항상 떠 있어야 하므로 opacity 1 고정. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: stage === 'idle' && !showIdleSchema ? 0 : 1,
          transition: 'opacity 420ms ease 180ms',
        }}
      >
        <ErdDiffViewer
          diff={erdDiff}
          graph={erdGraph}
          mode={mode}
          onModeChange={setMode}
          // 진단 패널은 좌측이므로 좌측 padding 보정에 panelOpen을 쓴다(기존 sqlSheetOpen 슬롯 재활용).
          sqlSheetOpen={panelOpen}
          riskSheetOpen={false}
          riskMap={isResultStage ? riskMap : {}}
          highlightTable={highlightTable}
          locateNonce={locateNonce}
          hops={hops}
          showAll={showAll}
          onSubset={setSubset}
        />
      </div>

      {/* 공통 배경 — 연결 화면과 동일한 후광. idle 빈 화면에선 후광이 주역(lobby),
          ERD가 그려지는 작업중엔 배경이 물러나 diff 색광(Diff Bloom)에 무대를 양보(work).
          ERD 캔버스(Layer0) 위, 콘텐츠 아래에 깔리도록 zIndex 5 래퍼로 감싼다. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
        <AppBackdrop stage={isIdleBlank ? 'lobby' : 'work'} />
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
        <StageProgress
          active={showDim}
          variant={stage === 'applying' ? 'applying' : 'analyzing'}
        />
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
          {language === 'ko' ? '안전한 스키마 마이그레이션 관리' : 'Safe schema migration control'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {/* DB 연결 그룹 — [● dbname](교체 모달) | (구분선) | [Disconnect](해제)를 한 pill로 묶어
              "둘 다 현재 연결을 다룬다"가 시각적으로 읽히게. 그룹 외곽선 하나 + 내부 분할. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
              background: 'var(--bg-tertiary)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            {/* 연결된 DB 배지 — 클릭 시 교체 모달 */}
            <button
              onClick={() => setReconnectOpen(true)}
              title={language === 'ko' ? '데이터베이스 변경' : 'Change database'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--color-success)',
                }}
              />
              {connectedDbname ?? (language === 'ko' ? '연결됨' : 'Connected')}
            </button>
            {/* 그룹 내부 구분선 */}
            <span style={{ width: 1, background: 'var(--border)' }} />
            {/* 연결 해제 — 온보딩 로비로 복귀. Secondary 톤(text-secondary)으로 가시성↑. */}
            <button
              onClick={onDisconnect}
              title={language === 'ko' ? '연결을 해제하고 다른 데이터베이스 선택' : 'Disconnect and pick another database'}
              style={{
                padding: '4px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {language === 'ko' ? '연결 해제' : 'Disconnect'}
            </button>
          </div>
          <ModelSettings />
          <LanguageToggle />
          <StageBadge />
          <AuditButton />
        </div>
      </div>

      {/* Layer3: DiffControls — preview/applied만. self-position(top:56 right:16)이므로
          래퍼 없이 reveal 스타일을 직접 주입(이중 absolute 방지). */}
      <DiffControls
        value={mode}
        onChange={setMode}
        style={reveal(isResultStage)}
        shownCount={subset?.shownCount}
        totalCount={subset?.totalCount}
        hops={hops}
        showAll={showAll}
        onHopsChange={setHops}
        onShowAllChange={setShowAll}
      />

      {/* Layer4: 진단 시트(좌측) — ERD가 그려지는 동안 노출. 진단 모아보기가 主, SQL은 탭 보조.
          idle 빈 화면(입력 전, ERD 없음)에선 숨김. 컴포넌트가 self-position. */}
      {(() => {
        // ERD에 그릴 그래프가 있는 상태에서만 패널 노출(preview/applying/applied + idle 전체보기).
        const panelVisible = isResultStage || showIdleSchema;
        return (
          <div
            style={{
              ...reveal(panelVisible),
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            <div style={{ pointerEvents: panelVisible ? 'auto' : 'none' }}>
              <DiagnosticsPanel
                open={panelOpen}
                onToggle={() => setPanelOpen((v) => !v)}
                diagnosticsGraph={diagnosticsGraph}
                onLocate={onLocate}
              />
            </div>
          </div>
        );
      })()}

      {/* 위험은 오른쪽 시트 대신 ERD 노드 붉은/노란 강조(riskMap)로 표시하고,
          critical은 InputPanel의 경고 모달로 알린다(별도 RiskSheet 제거). */}

      {/* Layer2: CommandBar(idle/analyzing/preview). idle 빈상태=화면 세로 중앙(LLM 사이트형),
          입력 시작(analyzing/preview)=하단으로 내려간다. 래퍼를 풀스크린 flex로 두고 정렬/패딩만
          바꿔 패널 높이가 가변이어도 안전하게 전이(Safari: transform 점프 없이 위치 이동).
          applying/applied는 숨김. View full schema 버튼은 idle 빈상태에서 입력창 아래에 노출. */}
      {(() => {
        const visible = stage === 'idle' || stage === 'analyzing' || stage === 'preview';
        return (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 36,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              // 정렬은 flex-end 고정 — idle 빈상태에선 paddingBottom을 키워 입력창을 화면 중앙 근처로
              // 밀어올린다. padding 전이만 쓰므로 중앙↔하단 이동이 점프 없이 부드럽다.
              justifyContent: 'flex-end',
              paddingBottom: isIdleBlank ? '42vh' : 24,
              gap: 'var(--space-3)',
              pointerEvents: 'none',
              opacity: visible ? 1 : 0,
              visibility: visible ? 'visible' : 'hidden',
              // 전체 스키마 보기 토글 시 입력창이 중앙↔하단으로 이동 — 큰 위치 이동이라 settle로
              // 탄성 정착(Apple .snappy). opacity는 페이드라 ease 유지.
              transition: 'opacity var(--transition-base), padding-bottom var(--transition-settle)',
            }}
          >
            <div style={{ pointerEvents: visible ? 'auto' : 'none' }}>
              <InputPanel />
            </div>
            {/* 전체 스키마 토글 — idle에서 항상 같은 자리(입력창 아래)에 노출. 라벨/동작만
                View full schema(켜기) ↔ Close schema(끄기)로 토글 → 버튼이 점프하지 않는다.
                좌상단 별도 Close 버튼을 없애 좌측 진단 패널과의 겹침도 해소. 큰 DB는 켤 때만 경고. */}
            {stage === 'idle' && (
              <button
                onClick={() => {
                  if (showFullSchema) {
                    setShowFullSchema(false);
                    return;
                  }
                  const total = graph?.nodes.length ?? 0;
                  const warn =
                    language === 'ko'
                      ? `${total}개 테이블 — 전체 스키마 렌더링이 느릴 수 있습니다. 계속할까요?`
                      : `${total} tables — rendering the full schema may be slow. Continue?`;
                  if (total > LARGE_SCHEMA_THRESHOLD && !window.confirm(warn)) {
                    return;
                  }
                  setShowFullSchema(true);
                }}
                style={{
                  pointerEvents: 'auto',
                  padding: '6px 14px',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {language === 'ko'
                  ? showFullSchema
                    ? '스키마 닫기'
                    : '전체 스키마 보기'
                  : showFullSchema
                    ? 'Close schema'
                    : 'View full schema'}
              </button>
            )}
          </div>
        );
      })()}


      {/* 누적 dry-run 액션(pending·Undo·Cancel·Apply All)은 InputPanel 하단에 통합됨.
          CompletedBar는 자체 stage 가드 + self-position. 항상 마운트. */}
      <CompletedBar />

      {/* 적용 완료 토스트 — applyAll 직후 클라이맥스 연출(C-2) */}
      <AppliedToast />

      {/* Layer7: AuditDrawer */}
      <AuditDrawer />

      {/* DB 교체 모달 — 연결된 상태에서 다른 DB로 전환. 교체 시 store가 epoch 변화로
          dryRunStack·분석 상태를 초기화한다(이전 DB 기준 무효). */}
      {reconnectOpen && (
        <DatabaseConnect onConnected={onConnected} onCancel={() => setReconnectOpen(false)} />
      )}

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
  const language = usePipelineStore((s) => s.language);
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
      {language === 'ko' ? '이력' : 'History'}
    </button>
  );
}
