'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePipelineStore } from '../../store/pipeline';
import { analyzeInput, applyAll } from '../../lib/api';

// CommandBar — 하단 중앙 floating pill. 입력 모드는 항상 auto(NL/SQL 자동 감지).
// idle=확장, analyzing=collapse+disabled. preview에서도 노출돼 누적 dry-run 입력을 받고,
// 입력창 아래 액션 행(pending·Undo·Cancel·Apply All)으로 누적 스택을 제어한다.
export default function InputPanel() {
  const {
    inputText,
    isAnalyzing,
    analyzeError,
    analyzeResult,
    stage,
    dryRunStack,
    language,
    setInputText,
    setStage,
    setAnalyzing,
    setAnalyzeError,
    setAnalyzeResult,
    pushDryRun,
    popDryRun,
    clearDryRun,
    reset,
  } = usePipelineStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // critical 경고 모달 — 같은 분석 결과(token)에 한 번만 자동으로 띄운다.
  // 모달을 확인(ack)하면 그 token에 한해 Apply All이 허용된다(별도 강행 버튼 없음).
  const [criticalOpen, setCriticalOpen] = useState(false);
  const [ackedToken, setAckedToken] = useState<string | null>(null);
  // 모달은 createPortal로 document.body에 렌더(부모의 transform이 fixed를 가두는 문제 회피).
  // SSR엔 document가 없으므로 클라이언트 마운트 후에만 portal한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 입력 내용에 맞춰 textarea 높이 자동 확장 — 최대 화면 절반(50vh), 그 이상은 내부 스크롤.
  // analyzing 중(collapsed)엔 1줄로 접어 두므로 auto-resize를 건너뛴다.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (isAnalyzing) {
      ta.style.height = '';
      return;
    }
    ta.style.height = 'auto'; // 먼저 줄여 scrollHeight를 정확히 측정
    const max = window.innerHeight * 0.5;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }, [inputText, isAnalyzing]);

  const detectedMode = analyzeResult?.mode ?? null;
  const confidence = analyzeResult?.detectedConfidence ?? null;
  const count = dryRunStack.length;
  // preview이고 스택이 쌓여 있으면 누적 액션 행 노출.
  const showActions = stage === 'preview' && count > 0;
  const hasCritical = analyzeResult?.hasCritical ?? false;
  const criticalRisks = (analyzeResult?.risks ?? []).filter((r) => r.level === 'critical');

  // critical이 감지되면(새 결과) 즉시 경고 모달 — 사용자가 확인한 결과(token)는 다시 안 띄움.
  // 새 분석(token 변경)마다 확인은 리셋(스택이 바뀌면 다시 확인받아야 함).
  useEffect(() => {
    const token = analyzeResult?.token ?? null;
    if (stage === 'preview' && hasCritical && token && token !== ackedToken) {
      setCriticalOpen(true);
    }
  }, [stage, hasCritical, analyzeResult?.token, ackedToken]);

  // 현재 분석 결과의 critical을 사용자가 확인했는가 → Apply All 허용 + confirmCritical 전송 기준.
  const criticalAcked = !hasCritical || ackedToken === (analyzeResult?.token ?? null);

  const acknowledgeCritical = () => {
    setCriticalOpen(false);
    setAckedToken(analyzeResult?.token ?? null);
  };

  const mapResult = (res: Awaited<ReturnType<typeof analyzeInput>>) => ({
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

  const handleAnalyze = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setActionError(null);
    try {
      // priorSqls=현재까지 쌓은 스택 → 백엔드가 실DB 위에 fold한 baseline 기준으로 diff.
      const res = await analyzeInput({ input: trimmed, priorSqls: dryRunStack });
      // 금지 패턴/파싱 실패는 200 OK + valid=false로 온다(예외 아님). 이 경우 스택에 쌓지 않고
      // 위반 사유를 에러 배너로 띄운 뒤 직전 화면/스택을 그대로 유지한다(입력도 보존).
      if (!res.valid) {
        setAnalyzeError(res.violations[0] ?? (language === 'ko' ? '이 SQL은 거부되었습니다.' : 'This SQL was rejected.'));
        setAnalyzing(false);
        return;
      }
      setAnalyzeResult(mapResult(res));
      pushDryRun(res.sql); // 정규화된 SQL을 스택에 쌓음(NL도 생성 SQL이 쌓임)
      setInputText(''); // 다음 누적 입력을 위해 비움
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : (language === 'ko' ? '분석에 실패했습니다' : 'Analysis failed'));
      setAnalyzing(false);
    }
  };

  // Undo: 스택 끝에서만 pop(LIFO) 후, 짧아진 스택으로 마지막 SQL을 재시뮬레이션해 diff 재계산.
  const handleUndo = async () => {
    const next = dryRunStack.slice(0, -1);
    popDryRun();
    if (next.length === 0) {
      reset(); // 빈 스택 → idle(실DB single graph)
      return;
    }
    const last = next[next.length - 1];
    const prior = next.slice(0, -1);
    setStage('analyzing'); // dim 오버레이
    setActionError(null);
    try {
      // 이미 정규화된 SQL이라 그대로 재분석. pushDryRun은 호출하지 않는다(스택 불변).
      const res = await analyzeInput({ input: last, priorSqls: prior });
      setAnalyzeResult(mapResult(res));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : (language === 'ko' ? 'Undo에 실패했습니다' : 'Undo failed'));
      setStage('preview');
    }
  };

  const handleApplyAll = async () => {
    // critical인데 아직 모달을 확인하지 않았으면 경고 모달을 띄우고 멈춤. 확인 후 다시 누르면 진행.
    if (hasCritical && !criticalAcked) {
      setCriticalOpen(true);
      return;
    }
    if (!confirmOpen && count > 1) {
      // 2개 이상 일괄 적용은 확인 모달 한 번(단건은 바로 적용).
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);
    setIsApplying(true);
    setStage('applying');
    setActionError(null);
    try {
      await applyAll(dryRunStack, hasCritical); // critical이면 확인을 거쳤으므로 confirmCritical 전송
      clearDryRun();
      setStage('applied'); // page.tsx가 현재 DB 그래프 재로드
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Apply failed');
      setStage('preview');
    } finally {
      setIsApplying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 쿼리 작성 편의: Enter=줄바꿈(기본), Cmd(맥)/Ctrl(윈도우)+Enter=제출.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAnalyze();
      return;
    }
    // Tab/Shift+Tab=들여쓰기/내어쓰기(포커스 이동 대신).
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = ta;
      if (e.shiftKey) {
        // 내어쓰기: 커서가 속한 줄 시작의 공백을 최대 4칸 제거.
        const lineStart = inputText.lastIndexOf('\n', s - 1) + 1;
        const leading = inputText.slice(lineStart).match(/^ {1,4}/)?.[0] ?? '';
        if (!leading) return; // 지울 공백 없음
        const removed = leading.length;
        const next = inputText.slice(0, lineStart) + inputText.slice(lineStart + removed);
        setInputText(next);
        // 커서를 제거한 만큼 앞으로 당김(줄 시작 이전으로는 안 내려가게).
        const caret = Math.max(lineStart, s - removed);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = caret;
        });
        return;
      }
      // 들여쓰기: 커서 위치에 공백 4칸 삽입.
      const next = inputText.slice(0, s) + '    ' + inputText.slice(en);
      setInputText(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 4;
      });
    }
  };

  const isDisabled = isAnalyzing || isApplying || stage === 'applying';
  // analyzing이면 collapse(1줄) — idle은 확장(3줄)
  const collapsed = isAnalyzing;
  // critical이어도 Apply All은 항상 누를 수 있다 — 미확인이면 누를 때 경고 모달이 뜨고,
  // 확인(Got it) 후 다시 누르면 적용된다. 적용 여부 판단은 사용자에게 맡긴다.
  const applyDisabled = isApplying || count === 0;
  const stacking = count > 0;

  const ghostBtn: React.CSSProperties = {
    padding: '6px 14px',
    fontSize: 'var(--font-size-sm)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  };

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
      {/* 상단: 자동감지 배지 (모드 토글·힌트 제거 — 항상 auto, Enter 제출) */}
      {detectedMode && confidence !== null && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
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
        </div>
      )}

      {/* 텍스트 입력 영역 */}
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        rows={collapsed ? 1 : 3}
        placeholder={
          language === 'ko'
            ? stacking
              ? '다른 변경을 추가하세요 (자연어 또는 SQL) — Cmd/Ctrl+Enter로 추가'
              : '자연어 또는 SQL을 입력하세요 (자동 감지) — Cmd/Ctrl+Enter로 분석'
            : stacking
              ? 'Add another change (natural language or SQL) — Cmd/Ctrl+Enter to add'
              : 'Enter natural language or SQL (auto-detected) — Cmd/Ctrl+Enter to analyze'
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
          transition: 'border-color var(--transition-fast)', // height는 auto-resize가 직접 제어(애니메이션 X)
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

      {/* 에러 메시지 (분석 에러 또는 누적 액션 에러) */}
      {(analyzeError || actionError) && (
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
          {analyzeError || actionError}
        </div>
      )}

      {/* 하단 액션 행 — 좌측: 누적 상태(pending·Undo·Cancel), 우측: Add to preview·Apply All */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* 좌측 누적 컨트롤 (preview·스택≥1에서만) */}
        {showActions && (
          <>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontWeight: 600,
                letterSpacing: '0.03em',
              }}
            >
              {language === 'ko' ? `대기 ${count}건` : `${count} pending`}
            </span>
            {hasCritical && (
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--color-error-bg)',
                  color: 'var(--color-error)',
                  border: '1px solid var(--color-error)',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                }}
              >
                CRITICAL
              </span>
            )}
            <button
              onClick={handleUndo}
              disabled={isDisabled}
              title={language === 'ko' ? '스택의 마지막 변경 되돌리기' : 'Undo the last change in the stack'}
              style={{ ...ghostBtn, opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
            >
              {language === 'ko' ? '되돌리기' : 'Undo'}
            </button>
            <button
              onClick={reset}
              disabled={isApplying}
              style={{
                ...ghostBtn,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: isApplying ? 'not-allowed' : 'pointer',
              }}
            >
              {language === 'ko' ? '취소' : 'Cancel'}
            </button>
          </>
        )}

        <span style={{ flex: 1 }} />

        {/* Add to preview (=분석/누적 추가) */}
        <button
          onClick={handleAnalyze}
          disabled={isDisabled || !inputText.trim()}
          style={{
            padding: '6px 18px',
            fontSize: 'var(--font-size-sm)',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-accent-border)',
            background: isAnalyzing ? 'transparent' : 'var(--color-accent-20)',
            color: isDisabled || !inputText.trim() ? 'var(--text-muted)' : 'var(--color-accent)',
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
          {language === 'ko'
            ? isAnalyzing
              ? '분석 중…'
              : stacking
                ? '미리보기에 추가'
                : '분석'
            : isAnalyzing
              ? 'Analyzing…'
              : stacking
                ? 'Add to preview'
                : 'Analyze'}
        </button>

        {/* Apply All (preview·스택≥1에서만) */}
        {showActions && (
          <button
            onClick={handleApplyAll}
            disabled={applyDisabled}
            title={
              language === 'ko'
                ? hasCritical && !criticalAcked
                  ? '심각한 위험이 있습니다. 누르면 먼저 확인 경고가 표시됩니다.'
                  : hasCritical
                    ? `확인한 심각한 위험을 포함해 ${count}건의 변경을 적용합니다.`
                    : `${count}건의 변경을 단일 트랜잭션으로 적용합니다.`
                : hasCritical && !criticalAcked
                  ? 'Critical risk present. Pressing this shows a warning to confirm first.'
                  : hasCritical
                    ? `Applying ${count} change${count === 1 ? '' : 's'} including a critical risk you confirmed.`
                    : `Apply all ${count} change${count === 1 ? '' : 's'} in a single transaction.`
            }
            style={{
              padding: '6px 16px',
              fontSize: 'var(--font-size-sm)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-accent-border)',
              background: applyDisabled ? 'var(--color-accent-10)' : 'var(--color-accent-20)',
              color: 'var(--color-accent)',
              cursor: applyDisabled ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              opacity: applyDisabled ? 0.5 : 1,
            }}
          >
            {language === 'ko'
              ? isApplying
                ? '적용 중…'
                : `전체 적용 (${count})`
              : isApplying
                ? 'Applying…'
                : `Apply All (${count})`}
          </button>
        )}
      </div>

      {/* critical 경고 모달 — 프리뷰에서 critical 감지 시 자동 표시. 확인 후 Apply All로 적용 가능. */}
      {mounted && criticalOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={acknowledgeCritical}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              padding: 24,
              maxWidth: 440,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-error)' }}>
                {language === 'ko' ? '심각한 위험 감지됨' : 'Critical risk detected'}
              </p>
              <span style={{ flex: 1 }} />
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {language === 'ko'
                ? '이 변경에는 심각한 위험이 있습니다. Undo로 제거하거나, 의도한 변경이라면 이 창을 닫고 Apply All을 눌러 진행하세요.'
                : 'This change carries a critical risk. Remove it with Undo, or — if this is intended — dismiss this dialog and press Apply All to proceed.'}
            </p>
            {/* 감지된 critical 위험 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {criticalRisks.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-error-bg)',
                    border: '1px solid var(--color-error-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      color: 'var(--color-error)',
                      letterSpacing: '0.05em',
                      fontFamily: 'var(--font-mono)',
                      marginBottom: 3,
                    }}
                  >
                    {r.rule}
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {language === 'ko' ? (r.messageKo || r.message) : r.message}
                  </p>
                  {(() => {
                    // 선택 언어 우선, 없으면 반대 언어로 폴백.
                    const note = language === 'ko' ? (r.llmNoteKo || r.llmNote) : (r.llmNote || r.llmNoteKo);
                    return note ? (
                      <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {note}
                      </p>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
            {/* 확인(인지)만 받는다 — 적용 여부는 사용자가 Apply All로 결정. 강행 버튼 없음. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={acknowledgeCritical}
                style={{
                  padding: '7px 16px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {language === 'ko' ? '확인' : 'Got it'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 일괄 적용 확인 모달 (2개 이상) */}
      {mounted && confirmOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {language === 'ko' ? `${count}건의 변경 적용` : `Apply ${count} changes`}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {language === 'ko' ? (
                <>
                  미리본 {count}건의 변경이 단일 트랜잭션으로 데이터베이스에 적용됩니다.
                  <br />
                  하나라도 실패하면 전부 적용되지 않습니다.
                </>
              ) : (
                <>
                  All {count} previewed changes will be applied to the database in a single transaction.
                  <br />
                  If any statement fails, none of them are applied.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: '7px 16px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {language === 'ko' ? '취소' : 'Cancel'}
              </button>
              <button
                onClick={handleApplyAll}
                style={{
                  padding: '7px 16px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--color-accent-border)',
                  background: 'var(--color-accent-20)',
                  color: 'var(--color-accent)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {language === 'ko' ? '전체 적용' : 'Apply All'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
