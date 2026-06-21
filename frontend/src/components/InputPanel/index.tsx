'use client';

import { useRef } from 'react';
import { usePipelineStore, type InputMode } from '../../store/pipeline';
import { analyzeInput } from '../../lib/api';

const MODE_LABELS: Record<InputMode, string> = {
  auto: 'Auto',
  nl: 'Natural Language',
  sql: 'SQL',
};

// CommandBar — 하단 중앙 floating pill. idle=확장, analyzing=collapse+disabled.
// preview/applied에서의 숨김/등장은 page.tsx의 reveal 래퍼가 담당(컴포넌트는 항상 마운트).
export default function InputPanel() {
  const {
    inputText,
    inputMode,
    isAnalyzing,
    analyzeError,
    analyzeResult,
    stage,
    setInputText,
    setInputMode,
    setAnalyzing,
    setAnalyzeError,
    setAnalyzeResult,
  } = usePipelineStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const detectedMode = analyzeResult?.mode ?? null;
  const confidence = analyzeResult?.detectedConfidence ?? null;

  const handleAnalyze = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await analyzeInput({
        input: trimmed,
        mode: inputMode === 'auto' ? undefined : inputMode,
      });
      setAnalyzeResult({
        mode: res.mode,
        detectedConfidence: res.detectedConfidence,
        sql: res.sql,
        explanation: res.explanation,
        explanationKo: res.explanationKo,
        schemaDiff: res.schemaDiff,
        dataSim: res.dataSim,
        risks: res.risks,
        downScript: res.downScript,
        token: res.token,
        hasCritical: res.risks.some((r) => r.level === 'critical'),
      });
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed');
      setAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const isDisabled = isAnalyzing || stage === 'applying';
  // analyzing이면 collapse(1줄) — idle은 확장(3줄)
  const collapsed = isAnalyzing;

  return (
    <div
      style={{
        width: 'min(720px, calc(100vw - 48px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      {/* 상단: 모드 세그먼트 + confidence 배지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {(['auto', 'nl', 'sql'] as InputMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              disabled={isDisabled}
              style={{
                padding: '3px 10px',
                fontSize: 'var(--font-size-xs)',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${inputMode === m ? 'var(--color-accent-border)' : 'var(--border)'}`,
                background: inputMode === m ? 'var(--color-accent-10)' : 'transparent',
                color: inputMode === m ? 'var(--color-accent)' : 'var(--text-secondary)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontWeight: inputMode === m ? 700 : 400,
                transition: 'all var(--transition-fast)',
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* 자동감지 confidence 배지 — 정보성이므로 info 색 유지 */}
        {detectedMode && confidence !== null && (
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-info-bg)',
              color: 'var(--color-info)',
              border: '1px solid var(--color-info-border)',
              fontWeight: 600,
            }}
          >
            {detectedMode === 'sql' ? 'Detected: SQL' : 'Detected: Natural Language'} {Math.round(confidence * 100)}%
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
          ⌘+Enter
        </span>
      </div>

      {/* 텍스트 입력 영역 */}
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        rows={collapsed ? 1 : 3}
        placeholder={
          inputMode === 'sql'
            ? 'Enter SQL (e.g. ALTER TABLE users ADD COLUMN age integer;)'
            : inputMode === 'nl'
            ? 'Describe your change (e.g. add an age column to the users table)'
            : 'Enter natural language or SQL (auto-detected)'
        }
        style={{
          resize: 'none',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: `1px solid ${analyzeError ? 'var(--color-error-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-md)',
          lineHeight: 1.6,
          outline: 'none',
          transition: 'border-color var(--transition-fast), height var(--transition-base)',
          minHeight: 0,
        }}
        onFocus={(e) => {
          if (!analyzeError) {
            e.currentTarget.style.borderColor = 'var(--border-focus)';
            e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = analyzeError ? 'var(--color-error-border)' : 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />

      {/* 에러 메시지 */}
      {analyzeError && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-error)',
          }}
        >
          {analyzeError}
        </div>
      )}

      {/* 분석 버튼 — accent teal (chrome 영역) */}
      <button
        onClick={handleAnalyze}
        disabled={isDisabled || !inputText.trim()}
        style={{
          alignSelf: 'flex-end',
          padding: '6px 18px',
          fontSize: 'var(--font-size-sm)',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-accent-border)',
          background: isAnalyzing ? 'transparent' : 'var(--color-accent-20)',
          color: isDisabled ? 'var(--text-muted)' : 'var(--color-accent)',
          cursor: isDisabled || !inputText.trim() ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          transition: 'all var(--transition-fast)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: isDisabled || !inputText.trim() ? 0.5 : 1,
        }}
      >
        {isAnalyzing && (
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        {isAnalyzing ? 'Analyzing…' : 'Analyze'}
      </button>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
