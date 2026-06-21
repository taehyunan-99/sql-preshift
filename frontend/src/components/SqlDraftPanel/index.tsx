'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const SHEET_WIDTH = 360;

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

  const showLoading = isAnalyzing || stage === 'analyzing';

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
          width: SHEET_WIDTH,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          boxShadow: 'var(--shadow-float)',
          transform: isOpen ? 'translateX(0)' : `translateX(-100%)`,
          transition: 'transform var(--transition-slow)',
          pointerEvents: isOpen ? 'auto' : 'none',
          overflow: 'hidden',
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

        {/* explanation + dataSim 통합 영역 (Monaco 하단) */}
        {!showLoading && analyzeResult && analyzeResult.explanation && (
          <div
            style={{
              padding: 'var(--space-md)',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-input)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Explanation
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              {analyzeResult.explanation}
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

      {/* 좌단 세로 핸들 — 접힘 시 노출. 클릭하면 slide-in */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Expand SQL draft"
        aria-expanded={isOpen}
        style={{
          alignSelf: 'center',
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
          marginLeft: isOpen ? 0 : -SHEET_WIDTH,
          transition: 'margin-left var(--transition-slow)',
        }}
      >
        {'</> SQL Draft'}
      </button>
    </div>
  );
}
