'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

type ExplainLang = 'en' | 'ko';

interface SqlSheetProps {
  /** 시트 열림 상태(통합 단계 page.tsx가 제어). 미전달 시 자체 로컬 state로 폴백. */
  open?: boolean;
  /** 핸들 클릭 토글 콜백(통합 단계가 fitView padding 보정에 사용). */
  onToggle?: () => void;
}

/**
 * SqlSheet — 좌측 floating 시트.
 * preview/applied stage에서만 의미. 항상 마운트(Monaco 재초기화 회피),
 * 접힘은 width/translateX로만 처리한다.
 */
export default function SqlDraftPanel({ open, onToggle }: SqlSheetProps) {
  const { analyzeResult, stage, isAnalyzing } = usePipelineStore();

  // controlled(props) 우선, 미전달 시 local state 폴백
  const [localOpen, setLocalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : localOpen;
  const toggle = () => {
    if (onToggle) onToggle();
    if (!isControlled) setLocalOpen((v) => !v);
  };

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
      // 시트는 좌측 고정 → 마우스 x가 그대로 폭. 범위 클램프.
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

  // EXPLANATION — 기본 접힘, 클릭 시 펼침. 언어 토글(en/ko).
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLang, setExplainLang] = useState<ExplainLang>('en');

  const showLoading = isAnalyzing || stage === 'analyzing';

  const explanationKo = analyzeResult?.explanationKo ?? '';
  const explanationEn = analyzeResult?.explanation ?? '';
  // ko 선택했는데 한국어가 없으면 영어로 폴백.
  const explainText = explainLang === 'ko' ? explanationKo || explanationEn : explanationEn;
  const hasExplanation = Boolean(explanationEn || explanationKo);

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
      {/* 시트 본문 — 접힘 시 translateX(-100%)로 화면 밖 슬라이드 */}
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
          transform: isOpen ? 'translateX(0)' : `translateX(-100%)`,
          // 드래그 중엔 transition 끔(끊김 방지), 열고닫기 슬라이드만 transition.
          transition: dragging.current ? 'none' : 'transform var(--transition-slow)',
          pointerEvents: isOpen ? 'auto' : 'none',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: '10px var(--space-md)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            SQL Draft
          </span>

          {analyzeResult && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                background: analyzeResult.mode === 'nl' ? 'var(--color-info-bg)' : 'var(--color-success-bg)',
                color: analyzeResult.mode === 'nl' ? 'var(--color-info)' : 'var(--color-success)',
                border: `1px solid ${analyzeResult.mode === 'nl' ? 'var(--color-info-border)' : 'var(--color-success-border)'}`,
                fontWeight: 600,
              }}
            >
              {analyzeResult.mode === 'nl' ? 'NL→SQL' : 'SQL'}
            </span>
          )}

          {/* 접기 버튼 */}
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse SQL draft"
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

        {/* 로딩 상태 */}
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
            <span style={{ fontSize: 'var(--font-size-sm)' }}>Generating SQL…</span>
          </div>
        )}

        {/* 빈 상태 */}
        {!showLoading && !analyzeResult && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: 'var(--space-sm)',
            }}
          >
            <span style={{ fontSize: 32, opacity: 0.4 }}>📝</span>
            <span style={{ fontSize: 'var(--font-size-sm)' }}>Analysis results will appear here</span>
          </div>
        )}

        {/* SQL 편집기 — Monaco는 항상 마운트(showLoading/빈 상태와 무관하게 visibility로만 토글) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: !showLoading && analyzeResult ? 'block' : 'none',
          }}
        >
          <MonacoEditor
            height="100%"
            language="sql"
            value={analyzeResult?.sql ?? ''}
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
              readOnly: false,
            }}
          />
        </div>

        {/* explanation 아코디언 (Monaco 하단) — 기본 접힘, 헤더 클릭 시 펼침 */}
        {!showLoading && analyzeResult && hasExplanation && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-input)',
              flexShrink: 0,
            }}
          >
            {/* 헤더 — 좌측 Explanation 토글(펼침/접힘), 우측 EN/한국어 언어 스위치 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-sm) var(--space-md)',
              }}
            >
              {/* 펼침/접힘 클릭 영역 */}
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
                  Explanation
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

              {/* 언어 스위치 — 한국어 있을 때만. 헤더에 항상 노출(펼침 여부 무관). */}
              {explanationKo && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['en', 'ko'] as ExplainLang[]).map((lang) => {
                    const active = explainLang === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          setExplainLang(lang);
                          setExplainOpen(true); // 언어 누르면 자동 펼침
                        }}
                        style={{
                          padding: '2px 10px',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                          background: active ? 'var(--bg-tertiary)' : 'transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {lang === 'en' ? 'EN' : '한국어'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 펼친 본문 */}
            {explainOpen && (
              <div style={{ padding: '0 var(--space-md) var(--space-md)' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    color: 'var(--text-primary)',
                    lineHeight: 1.7,
                  }}
                >
                  {explainText}
                </p>

                {/* 영향 행 수 (dataSim) */}
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
                    <span>Estimated rows: <strong style={{ color: 'var(--text-secondary)' }}>{analyzeResult.dataSim.estimatedRows.toLocaleString()}</strong></span>
                    <span>Affected rows: <strong style={{ color: 'var(--text-secondary)' }}>{analyzeResult.dataSim.affectedRows.toLocaleString()}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 우측 리사이즈 핸들 — 드래그로 폭 조절 */}
        <div
          onMouseDown={onDragStart}
          title="Drag to resize"
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

      {/* 좌단 세로 핸들 — 접힘 시 노출. 클릭하면 slide-in */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Expand SQL draft"
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
          // 시트가 열려 있으면 핸들은 시트 우측 모서리에 붙어 보이도록 자연스럽게 위치
          marginLeft: isOpen ? 0 : -width,
          transition: dragging.current ? 'none' : 'margin-left var(--transition-slow)',
        }}
      >
        {'</> SQL Draft'}
      </button>
    </div>
  );
}
