'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePipelineStore, type Language } from '../../store/pipeline';
import {
  collectDiagnostics,
  summarizeDiagnostics,
  DIAGNOSTIC_ORDER,
  type DiagnosticItem,
  type DiagnosticKind,
} from '../../lib/diagnostics';
import type { SchemaGraph } from '../../lib/api';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 300;
const MAX_WIDTH = 720;

type Tab = 'diagnostics' | 'sql';

// kind별 마커 — 진단 5종을 색맹 대비되는 형태+중립/경고색으로. broken만 warn(경고색), 나머지 info(중립).
// ERD 인라인 마커(ColumnRow/TableNode)와 의미·색을 일치시킨다. 라벨은 언어별(영어 source-of-truth).
const KIND_MARK: Record<DiagnosticKind, { label: string; labelKo: string; warn: boolean }> = {
  broken: { label: 'Broken refs', labelKo: '깨진 참조', warn: true },
  softDelRef: { label: 'Soft-del refs', labelKo: 'Soft-del 참조', warn: false },
  orphan: { label: 'Isolated', labelKo: '고립됨', warn: false },
  implicitFk: { label: 'Estimated FK', labelKo: '추정 FK', warn: false },
  highNull: { label: 'Rarely used', labelKo: '거의 미사용', warn: false },
};

interface DiagnosticsPanelProps {
  /** 시트 열림 상태(page.tsx가 제어). */
  open?: boolean;
  /** 핸들 클릭 토글 콜백. */
  onToggle?: () => void;
  /** 진단 소스 그래프 — preview=schemaDiff.before, idle/applied=현재 graph. */
  diagnosticsGraph?: SchemaGraph;
  /** 진단 항목 "Locate in ERD" — 해당 테이블로 카메라 이동+강조. */
  onLocate?: (table: string) => void;
}

/**
 * DiagnosticsPanel — 좌측 floating 시트, [Diagnostics | SQL] 두 탭.
 * 기본 Diagnostics(데이터 무결성 진단 모아보기, 主). SQL 탭은 생성 SQL+설명(보조, 신뢰 검증용).
 * 항상 마운트(Monaco 재초기화 회피), 접힘은 transform으로만.
 */
export default function DiagnosticsPanel({
  open,
  onToggle,
  diagnosticsGraph,
  onLocate,
}: DiagnosticsPanelProps) {
  const { analyzeResult, stage, isAnalyzing, language } = usePipelineStore();

  const [localOpen, setLocalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : localOpen;
  const toggle = () => {
    if (onToggle) onToggle();
    if (!isControlled) setLocalOpen((v) => !v);
  };

  const [tab, setTab] = useState<Tab>('diagnostics');

  // 시트 폭 — 우측 가장자리 드래그로 조절.
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // 진단 수집 — 소스 그래프·언어가 바뀔 때 재계산(title/why/fix가 언어별).
  const items = useMemo(
    () => collectDiagnostics(diagnosticsGraph, language),
    [diagnosticsGraph, language],
  );
  const counts = useMemo(() => summarizeDiagnostics(items), [items]);

  // SQL 탭 상태(기존 Draft에서 이관). 표시 언어는 전역 store(language)가 제어.
  const [explainOpen, setExplainOpen] = useState(false);
  // SQL 탭의 Up/Down 토글 — Up=적용될 SQL, Down=롤백 SQL(자동 생성).
  const [sqlDir, setSqlDir] = useState<'up' | 'down'>('up');
  const showLoading = isAnalyzing || stage === 'analyzing';
  const explanationKo = analyzeResult?.explanationKo ?? '';
  const explanationEn = analyzeResult?.explanation ?? '';
  const explainText = language === 'ko' ? explanationKo || explanationEn : explanationEn;
  const hasExplanation = Boolean(explanationEn || explanationKo);

  // 롤백 스크립트 — 빈 문자열 또는 전부 주석(ROLLBACK UNSUPPORTED/원본 정보 없음)이면 자동 롤백 불가.
  const downScript = analyzeResult?.downScript ?? '';
  const downHasExec = downScript
    .split('\n')
    .some((l) => l.trim() && !l.trim().startsWith('--'));
  const upSql = analyzeResult?.sql ?? '';
  const monacoValue = sqlDir === 'down' ? downScript : upSql;

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        bottom: 0,
        left: 0,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      {/* 시트 본문 — 접힘 시 translateX(-100%) */}
      <div
        style={{
          width,
          flexShrink: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          boxShadow: 'var(--shadow-float)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: dragging.current ? 'none' : 'transform var(--transition-slow)',
          pointerEvents: isOpen ? 'auto' : 'none',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 헤더: 탭 [Diagnostics | SQL] + 접기 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: '8px var(--space-md)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            {(
              [
                ['diagnostics', language === 'ko' ? '진단' : 'Diagnostics'],
                ['sql', 'SQL'],
              ] as [Tab, string][]
            ).map(([key, label]) => {
              const active = tab === key;
              // broken이 있으면 Diagnostics 탭에 경고 dot — 탭을 안 열어도 신호가 보이게.
              const showWarnDot = key === 'diagnostics' && counts.broken > 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
                    background: active ? 'var(--bg-tertiary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                  {showWarnDot && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-error)',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse panel"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ‹
          </button>
        </div>

        {/* ── Diagnostics 탭 ── */}
        {tab === 'diagnostics' && (
          <DiagnosticsTab items={items} counts={counts} onLocate={onLocate} language={language} />
        )}

        {/* ── SQL 탭 (기존 Draft 이관, 항상 마운트하되 visibility로 토글 — Monaco 재초기화 회피) ── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: tab === 'sql' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          {showLoading && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-md)',
                color: 'var(--text-secondary)',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  border: '3px solid var(--border)',
                  borderTopColor: 'var(--color-accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span style={{ fontSize: 'var(--font-size-sm)' }}>
                {language === 'ko' ? 'SQL 생성 중…' : 'Generating SQL…'}
              </span>
            </div>
          )}
          {!showLoading && !analyzeResult && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 'var(--font-size-sm)',
                padding: 'var(--space-md)',
                textAlign: 'center',
              }}
            >
              {language === 'ko' ? '생성된 SQL이 여기에 표시됩니다.' : 'The generated SQL will appear here.'}
            </div>
          )}
          {/* Up/Down 토글 — Up=적용 SQL, Down=롤백 SQL. 변경을 적용하기 전에 되돌릴 SQL을 미리 확인. */}
          {!showLoading && analyzeResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px var(--space-md)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              {(['up', 'down'] as const).map((dir) => {
                const active = sqlDir === dir;
                const label =
                  dir === 'up'
                    ? language === 'ko'
                      ? '적용'
                      : 'Up'
                    : language === 'ko'
                      ? '롤백'
                      : 'Down';
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setSqlDir(dir)}
                    style={{
                      padding: '3px 12px',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      borderRadius: 'var(--radius-pill)',
                      border: `1px solid ${active ? 'var(--color-accent-border)' : 'var(--border)'}`,
                      background: active ? 'var(--color-accent-10)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <span style={{ flex: 1 }} />
              {sqlDir === 'down' && !downHasExec && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {language === 'ko' ? '자동 롤백 불가' : 'No automatic rollback'}
                </span>
              )}
            </div>
          )}
          {/* Monaco는 항상 마운트(display:none과 무관하게 SQL 탭일 때만 block). */}
          <div
            style={{ flex: 1, minHeight: 0, display: !showLoading && analyzeResult ? 'block' : 'none' }}
          >
            <MonacoEditor
              height="100%"
              language="sql"
              value={monacoValue}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'Fira Code, JetBrains Mono, Cascadia Code, monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                wordWrap: 'on',
                readOnly: true, // 표시 전용 — apply는 dryRunStack 기반이라 편집은 반영 안 됨(혼란 방지).
              }}
            />
          </div>
          {/* 위험 리스트 — critical/warning/info 전부 텍스트로 설명(모달은 critical만). A-5/A-3. */}
          {!showLoading && analyzeResult && (analyzeResult.risks.length > 0 || analyzeResult.dataSim?.constraintHint) && (
            <RiskList
              risks={analyzeResult.risks}
              dataSim={analyzeResult.dataSim}
              language={language}
              onLocate={onLocate}
            />
          )}

          {/* explanation 아코디언 (기존 이관) */}
          {!showLoading && analyzeResult && hasExplanation && (
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-input)', flexShrink: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  padding: 'var(--space-sm) var(--space-md)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExplainOpen((v) => !v)}
                  aria-expanded={explainOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {language === 'ko' ? '설명' : 'Explanation'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      transition: 'transform var(--transition-fast)',
                      transform: explainOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▾
                  </span>
                </button>
                <span style={{ flex: 1 }} />
              </div>
              {explainOpen && (
                <div style={{ padding: '0 var(--space-md) var(--space-md)' }}>
                  <p style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    {explainText}
                  </p>
                  {analyzeResult.dataSim && (
                    <div
                      style={{
                        marginTop: 'var(--space-sm)',
                        display: 'flex',
                        gap: 'var(--space-md)',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>
                        {language === 'ko' ? '예상 행 수: ' : 'Estimated rows: '}
                        <strong style={{ color: 'var(--text-secondary)' }}>
                          {analyzeResult.dataSim.estimatedRows.toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        {language === 'ko' ? '영향 행 수: ' : 'Affected rows: '}
                        <strong style={{ color: 'var(--text-secondary)' }}>
                          {analyzeResult.dataSim.affectedRows.toLocaleString()}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 우측 리사이즈 핸들 */}
        <div
          onMouseDown={onDragStart}
          title={language === 'ko' ? '드래그하여 크기 조절' : 'Drag to resize'}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            background: 'transparent',
            zIndex: 1,
          }}
        />
      </div>

      {/* 좌단 세로 핸들 — 접힘 시 노출 */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Expand diagnostics panel"
        aria-expanded={isOpen}
        style={{
          alignSelf: 'center',
          flexShrink: 0,
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderLeft: 'none',
          borderTopRightRadius: 'var(--radius-md)',
          borderBottomRightRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-float)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '14px 6px',
          cursor: 'pointer',
          pointerEvents: 'auto',
          marginLeft: isOpen ? 0 : -width,
          transition: dragging.current ? 'none' : 'margin-left var(--transition-slow)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {language === 'ko' ? '진단' : 'Diagnostics'}
        {/* 접힌 상태에서도 broken 신호 — 빨간 dot */}
        {counts.broken > 0 && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-error)' }} />
        )}
      </button>
    </div>
  );
}

// ── Diagnostics 탭 본문 ──
function DiagnosticsTab({
  items,
  counts,
  onLocate,
  language,
}: {
  items: DiagnosticItem[];
  counts: Record<DiagnosticKind, number>;
  onLocate?: (table: string) => void;
  language: Language;
}) {
  // 펼친 항목 id(단일 클릭 = 펼침/접힘). 이동은 펼친 안 버튼으로만(의도치 않은 카메라 이동 방지).
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-md)',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {language === 'ko' ? '무결성 문제가 없습니다' : 'No integrity issues found'}
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
          {language === 'ko'
            ? '연결된 스키마에서 외래 키, 고립 테이블, 고아 행이 모두 정상으로 보입니다.'
            : 'Foreign keys, isolated tables, and orphaned rows all look healthy in the connected schema.'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 요약 카운트 칩 — kind별 개수(0 제외). broken만 경고색. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 'var(--space-sm) var(--space-md)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {DIAGNOSTIC_ORDER.filter((k) => counts[k] > 0).map((k) => {
          const mark = KIND_MARK[k];
          return (
            <span
              key={k}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${mark.warn ? 'var(--color-error-border)' : 'var(--border-strong)'}`,
                color: mark.warn ? 'var(--color-error)' : 'var(--text-secondary)',
                background: mark.warn ? 'var(--color-error-bg)' : 'transparent',
              }}
            >
              <strong>{counts[k]}</strong>
              {language === 'ko' ? mark.labelKo : mark.label}
            </span>
          );
        })}
      </div>

      {/* 항목 리스트 — 스크롤 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.map((it) => {
          const isExp = expanded === it.id;
          const mark = KIND_MARK[it.kind];
          return (
            <div key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
              {/* 항목 헤더 — 단일 클릭 = 펼침/접힘 */}
              <button
                type="button"
                onClick={() => setExpanded((cur) => (cur === it.id ? null : it.id))}
                aria-expanded={isExp}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  padding: '10px var(--space-md)',
                  background: isExp ? 'var(--bg-tertiary)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* severity 마커 — warn=경고삼각색 dot / info=중립 dot */}
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: mark.warn ? 'var(--color-error)' : 'var(--text-tertiary)',
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.target}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {it.title}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    transition: 'transform var(--transition-fast)',
                    transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)',
                    flexShrink: 0,
                  }}
                >
                  ▾
                </span>
              </button>

              {/* 펼친 본문 — Why / Fix + Locate in ERD 버튼 */}
              {isExp && (
                <div style={{ padding: '0 var(--space-md) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  <Field label={language === 'ko' ? '원인' : 'Why'} text={it.why} />
                  <Field label={language === 'ko' ? '권장 조치' : 'Suggested fix'} text={it.fix} />
                  <button
                    type="button"
                    onClick={() => onLocate?.(it.table)}
                    style={{
                      alignSelf: 'flex-start',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                      padding: '5px 12px',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {language === 'ko' ? 'ERD에서 찾기' : 'Locate in ERD'}
                    <span aria-hidden>→</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 위험 리스트 (SQL 탭) — critical/warning/info를 색·텍스트로 모두 설명 ──
type RiskRow = {
  level: 'critical' | 'warning' | 'info';
  rule: string;
  message: string;
  messageKo?: string;
  tables?: string[];
  llmNote?: string;
  llmNoteKo?: string;
};
type DataSim = {
  affectedRows: number;
  estimatedRows: number;
  constraintViolations?: number | null;
  constraintHint?: string | null;
  constraintHintKo?: string | null;
} | null;

const RISK_STYLE: Record<RiskRow['level'], { color: string; bg: string; border: string }> = {
  critical: { color: 'var(--color-error)', bg: 'var(--color-error-bg)', border: 'var(--color-error-border)' },
  warning: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', border: 'var(--color-warning)' },
  info: { color: 'var(--text-secondary)', bg: 'transparent', border: 'var(--border-strong)' },
};

function RiskList({
  risks,
  dataSim,
  language,
  onLocate,
}: {
  risks: RiskRow[];
  dataSim: DataSim;
  language: Language;
  onLocate?: (table: string) => void;
}) {
  const ko = language === 'ko';
  // 위반 행수 칩 — constraintViolations가 점검된 경우만(null=비대상). 0=안전(중립), N>0=경고.
  const cv = dataSim?.constraintViolations;
  const hasCv = cv !== null && cv !== undefined;
  const cvHint = ko ? dataSim?.constraintHintKo || dataSim?.constraintHint : dataSim?.constraintHint;

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-input)',
        flexShrink: 0,
        maxHeight: '38%',
        overflowY: 'auto',
        padding: 'var(--space-sm) var(--space-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {hasCv && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${cv! > 0 ? 'var(--color-warning)' : 'var(--border-strong)'}`,
            background: cv! > 0 ? 'var(--color-warning-bg)' : 'transparent',
          }}
        >
          <strong
            style={{
              fontSize: 'var(--font-size-sm)',
              color: cv! > 0 ? 'var(--color-warning)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {cv!.toLocaleString()}
          </strong>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {cvHint}
          </span>
        </div>
      )}
      {risks.map((r, i) => {
        const st = RISK_STYLE[r.level];
        const msg = ko ? r.messageKo || r.message : r.message;
        const note = ko ? r.llmNoteKo || r.llmNote : r.llmNote;
        return (
          <div
            key={`${r.rule}-${i}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              borderLeft: `3px solid ${st.color}`,
              background: st.bg,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: st.color,
                  border: `1px solid ${st.border}`,
                  borderRadius: 'var(--radius-pill)',
                  padding: '1px 6px',
                }}
              >
                {r.level}
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {r.rule}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {msg}
            </p>
            {/* 영향 테이블 칩 — 클릭 시 ERD에서 해당 노드 강조(진단의 Locate in ERD와 동일 UX) */}
            {r.tables && r.tables.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {r.tables.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onLocate?.(t)}
                    title={ko ? 'ERD에서 찾기' : 'Locate in ERD'}
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {note && (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
}
