'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePipelineStore } from '../../store/pipeline';
import { analyzeInput, applyAll, getLlmStatus, type LlmStatus } from '../../lib/api';

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
    resultCache,
    language,
    setInputText,
    setStage,
    setAnalyzing,
    setAnalyzeError,
    setAnalyzeResult,
    pushDryRun,
    popDryRun,
    prepareApply,
    setAppliedToast,
    setLastAppliedAuditIds,
    reset,
  } = usePipelineStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 입력창 포커스 여부 — 셸 전체에 teal ring glow를 주기 위한 상태(B+F 조합).
  const [focused, setFocused] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 위험 경고 모달 — critical/warning 모두 같은 분석 결과(token)에 한 번만 자동으로 띄운다.
  // critical이면 확인(ack)해야 Apply All이 허용되고, warning은 정보성(ack는 받되 Apply 차단 없음).
  const [criticalOpen, setCriticalOpen] = useState(false);
  const [ackedToken, setAckedToken] = useState<string | null>(null);
  // 모달은 createPortal로 document.body에 렌더(부모의 transform이 fixed를 가두는 문제 회피).
  // SSR엔 document가 없으므로 클라이언트 마운트 후에만 portal한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // NL 가용성 — Ollama serve + 필수 모델이 있어야 자연어 입력이 동작한다.
  // 조회 실패/무응답은 미가용으로 간주(SQL-only 안내). 마운트 시 1회.
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  useEffect(() => {
    getLlmStatus()
      .then(setLlm)
      .catch(() => setLlm(null));
  }, []);
  // 안내는 명시적 미가용일 때만 띄운다(조회 전 null은 깜빡임 방지로 무표시).
  const nlUnavailable = llm !== null && !llm.ready;

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
  // 스택 전체 critical 집계 — Apply All은 스택 전수(sqls[0]부터)를 선검사하므로,
  // 마지막 analyzeResult가 아니라 resultCache(스택과 1:1) 전체에서 critical을 봐야 게이트가 정확하다.
  // (앞선 critical + 마지막 safe 조합에서 백엔드 422 데드락을 막는 핵심.)
  const stackHasCritical = resultCache.some((r) => r.risks.some((x) => x.level === 'critical'));
  // 스택 상태 식별 키 — 길이 + 마지막 token. 스택이 바뀌면(추가/Undo) 키가 달라져 재확인을 강제한다.
  const stackToken = `${dryRunStack.length}|${resultCache[resultCache.length - 1]?.token ?? ''}`;
  // 모달에 표시할 위험 — 스택 전체(resultCache)의 critical+warning을 모은다(마지막 결과만 보면 앞선 critical 누락).
  // critical을 위로 정렬. info는 정보성이라 제외.
  const alertRisks = resultCache
    .flatMap((r) => r.risks)
    .filter((r) => r.level === 'critical' || r.level === 'warning')
    .sort((a, b) => (a.level === 'critical' ? -1 : 0) - (b.level === 'critical' ? -1 : 0));
  const hasWarning = alertRisks.some((r) => r.level === 'warning');
  // 모달의 대표 수준 — critical 우선, 없으면 warning. 색/문구 분기 기준. 스택 전체 기준.
  const alertLevel: 'critical' | 'warning' | null = stackHasCritical
    ? 'critical'
    : hasWarning
      ? 'warning'
      : null;

  // critical/warning이 감지되면(스택 변화) 즉시 경고 모달 — 확인한 스택(stackToken)은 다시 안 띄움.
  // 스택이 바뀌면(길이·내용 변경) 재확인받아야 함.
  useEffect(() => {
    if (stage === 'preview' && alertLevel && stackToken !== ackedToken) {
      setCriticalOpen(true);
    }
  }, [stage, alertLevel, stackToken, ackedToken]);

  // 스택 전체의 critical을 사용자가 확인했는가 → Apply All 허용 + confirmCritical 전송 기준.
  // (warning은 Apply를 막지 않으므로 critical만 게이트.)
  const criticalAcked = !stackHasCritical || ackedToken === stackToken;

  const acknowledgeCritical = () => {
    setCriticalOpen(false);
    setAckedToken(stackToken);
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
      const mapped = mapResult(res);
      setAnalyzeResult(mapped);
      pushDryRun(res.sql, mapped); // 정규화된 SQL + 그 시점 분석 결과를 함께 캐시(Undo 즉시 복원용)
      setInputText(''); // 다음 누적 입력을 위해 비움
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : (language === 'ko' ? '분석에 실패했습니다' : 'Analysis failed'));
      setAnalyzing(false);
    }
  };

  // Undo: 스택 끝에서만 pop(LIFO). 직전 단계 결과를 캐시에서 즉시 복원 — 서버·LLM 재호출 없음.
  const handleUndo = () => {
    const nextLen = dryRunStack.length - 1;
    popDryRun();
    if (nextLen <= 0) {
      reset(); // 빈 스택 → idle(실DB single graph)
      return;
    }
    // resultCache는 dryRunStack과 1:1 — pop 후 마지막 캐시가 복원 대상.
    const restored = resultCache[nextLen - 1];
    if (restored) {
      setActionError(null);
      setAnalyzeResult(restored); // stage='preview'로 즉시 전환(setAnalyzeResult 내부)
    } else {
      // 캐시 미스(있어선 안 됨) — 안전망으로 idle 복귀.
      reset();
    }
  };

  const handleApplyAll = async () => {
    // 스택 전체에 critical이 있는데 아직 모달을 확인하지 않았으면 경고 모달을 띄우고 멈춤. 확인 후 다시 누르면 진행.
    if (stackHasCritical && !criticalAcked) {
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
      const appliedCount = dryRunStack.length; // prepareApply 전 캡처
      const res = await applyAll(dryRunStack, stackHasCritical); // 스택 전체 critical 기준 — 확인을 거쳤으므로 confirmCritical 전송
      prepareApply(); // 스택을 백업+비움 — Rollback이 백업에서 프리뷰를 복원
      setLastAppliedAuditIds(res.auditIds); // Applied 바의 Rollback이 역순 롤백에 사용
      setStage('applied'); // page.tsx가 현재 DB 그래프 재로드
      setAppliedToast(appliedCount); // 적용 완료 토스트(C-2 클라이맥스)
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
      className="glass-trim"
      style={{
        width: 'min(720px, calc(100vw - 48px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--bg-secondary)',
        // focus 시 셸 전체가 teal로 점등(B+F 조합) — 입력칸 자체엔 테두리 없이 한 면처럼.
        border: `1px solid ${focused ? 'var(--color-accent-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: focused
          ? '0 0 0 4px var(--color-accent-10), 0 0 30px -4px var(--color-accent), var(--shadow-float)'
          : 'var(--shadow-float)',
        transition: 'border-color var(--transition-base), box-shadow var(--transition-base)',
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
          // NL 미가용(Ollama 부재)이면 SQL 전용 안내로 — 자연어를 쳐도 503이 친절히 안내되지만,
          // 미리 SQL을 유도해 헛입력을 줄인다. 가용/미상이면 기존 자동감지 문구.
          nlUnavailable
            ? language === 'ko'
              ? stacking
                ? 'SQL을 추가하세요. 자연어 입력은 Ollama가 필요합니다. Cmd/Ctrl+Enter로 추가'
                : 'SQL을 입력하세요. 자연어 입력은 Ollama가 필요합니다. Cmd/Ctrl+Enter로 분석'
              : stacking
                ? 'Add SQL. Natural-language input requires Ollama. Cmd/Ctrl+Enter to add'
                : 'Enter SQL. Natural-language input requires Ollama. Cmd/Ctrl+Enter to analyze'
            : language === 'ko'
              ? stacking
                ? '다른 변경을 추가하세요 (자연어 또는 SQL). Cmd/Ctrl+Enter로 추가'
                : '자연어 또는 SQL을 입력하세요 (자동 감지). Cmd/Ctrl+Enter로 분석'
              : stacking
                ? 'Add another change (natural language or SQL). Cmd/Ctrl+Enter to add'
                : 'Enter natural language or SQL (auto-detected). Cmd/Ctrl+Enter to analyze'
        }
        style={{
          resize: 'none',
          // seamless — 입력칸은 셸과 한 면(별도 테두리/배경 없음). focus 강조는 셸 전체가 담당.
          background: 'transparent',
          color: 'var(--text-primary)',
          // error만 입력칸에 빨강 테두리로 직접 표시(에러 피드백은 입력 위치에 붙어야 명확).
          border: `1px solid ${analyzeError ? 'var(--color-error-border)' : 'transparent'}`,
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-md)',
          lineHeight: 1.6,
          outline: 'none',
          transition: 'border-color var(--transition-fast)', // height는 auto-resize가 직접 제어(애니메이션 X)
          minHeight: 0,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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

      {/* NL 미가용 안내 — Ollama 부재 시 SQL 전용임을 차분히(info 톤) 알린다.
          에러 배너가 떠 있으면 중복을 피해 숨긴다. */}
      {nlUnavailable && !analyzeError && !actionError && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {/* 미가용 사유 분기: Ollama 자체 부재 vs 도달했으나 모델 미선택(Model 설정 유도). */}
          {llm?.reachable
            ? language === 'ko'
              ? '자연어 모델이 선택되지 않았습니다. 상단 Model에서 모델을 골라 자연어 입력을 켜세요. SQL 직접 입력은 바로 가능합니다.'
              : 'No natural-language model selected. Pick one in Model (top bar) to enable it. Direct SQL input works right away.'
            : language === 'ko'
              ? 'Ollama가 감지되지 않아 자연어 입력은 비활성화됩니다. SQL을 직접 입력하세요.'
              : 'Ollama not detected. Natural-language input is disabled. Enter SQL directly.'}
        </div>
      )}

      {/* 하단 액션 행 — 좌측: 누적 상태(pending·Undo·Cancel), 우측: Add to preview·Apply All */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* 좌측 누적 컨트롤 (preview·스택≥1에서만) — D(요약형): 칩 2개 대신 한 줄 상태 텍스트.
            "N changes staged · K critical/warning"로 요약하고, Undo·Cancel은 보조 ghost로 둔다. */}
        {showActions && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {language === 'ko' ? `${count}건 준비됨` : `${count} change${count === 1 ? '' : 's'} staged`}
              {alertLevel && (
                <>
                  {' · '}
                  <span style={{ color: alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                    {alertLevel === 'critical'
                      ? language === 'ko' ? '심각 1건' : '1 critical'
                      : language === 'ko' ? '경고 1건' : '1 warning'}
                  </span>
                </>
              )}
            </span>
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
                ? stackHasCritical && !criticalAcked
                  ? '심각한 위험이 있습니다. 누르면 먼저 확인 경고가 표시됩니다.'
                  : stackHasCritical
                    ? `확인한 심각한 위험을 포함해 ${count}건의 변경을 적용합니다.`
                    : `${count}건의 변경을 단일 트랜잭션으로 적용합니다.`
                : stackHasCritical && !criticalAcked
                  ? 'Critical risk present. Pressing this shows a warning to confirm first.'
                  : stackHasCritical
                    ? `Applying ${count} change${count === 1 ? '' : 's'} including a critical risk you confirmed.`
                    : `Apply all ${count} change${count === 1 ? '' : 's'} in a single transaction.`
            }
            style={{
              padding: '6px 18px',
              fontSize: 'var(--font-size-sm)',
              borderRadius: 'var(--radius-pill)',
              // D — 주 행동이므로 솔리드 accent(활성)로 부각. 비활성은 soft로 낮춤.
              border: `1px solid ${applyDisabled ? 'var(--color-accent-border)' : 'var(--color-accent)'}`,
              background: applyDisabled ? 'var(--color-accent-10)' : 'var(--color-accent)',
              color: applyDisabled ? 'var(--color-accent)' : 'var(--text-inverse)',
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

      {/* 위험 경고 모달 — 프리뷰에서 critical/warning 감지 시 자동 표시. critical은 확인 후 Apply 가능. */}
      {mounted && criticalOpen && alertLevel && createPortal(
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
              border: `1px solid ${alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)'}`,
              // 상단 굵은 색 밴드 — warning 주황도 "경고"로 즉시 인식되도록 시각 강도 강화.
              borderTop: `4px solid ${alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 24,
              maxWidth: 440,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
              {/* 명시 레벨 배지 — 색만으로 경고 수준을 전달하지 않도록 텍스트 라벨 병기. */}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-sm)',
                  color: alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)',
                  background: alertLevel === 'critical' ? 'var(--color-error-bg)' : 'var(--color-warning-bg)',
                  border: `1px solid ${alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)'}`,
                }}
              >
                {alertLevel === 'critical' ? 'CRITICAL' : 'WARNING'}
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: alertLevel === 'critical' ? 'var(--color-error)' : 'var(--color-warning)',
                }}
              >
                {alertLevel === 'critical'
                  ? language === 'ko' ? '심각한 위험 감지됨' : 'Critical risk detected'
                  : language === 'ko' ? '위험 경고' : 'Risk warning'}
              </p>
              <span style={{ flex: 1 }} />
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {alertLevel === 'critical'
                ? language === 'ko'
                  ? '이 변경에는 심각한 위험이 있습니다. Undo로 제거하거나, 의도한 변경이라면 이 창을 닫고 Apply All을 눌러 진행하세요.'
                  : 'This change carries a critical risk. Remove it with Undo, or, if this is intended, dismiss this dialog and press Apply All to proceed.'
                : language === 'ko'
                  ? '이 변경에는 운영 중 락·다운타임을 유발할 수 있는 위험이 있습니다. 의도를 확인한 뒤 진행하세요.'
                  : 'This change may cause locking or downtime in production. Review the warnings before proceeding.'}
            </p>
            {/* 감지된 위험 목록 — critical(빨강) + warning(노랑) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {alertRisks.map((r, i) => {
                const isCrit = r.level === 'critical';
                return (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isCrit ? 'var(--color-error-bg)' : 'var(--color-warning-bg)',
                    border: `1px solid ${isCrit ? 'var(--color-error-border)' : 'var(--color-warning)'}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      color: isCrit ? 'var(--color-error)' : 'var(--color-warning)',
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
                    // size-aware — 영향 규모를 위험 레벨 색 + mono로 구체화.
                    const sn = language === 'ko' ? (r.sizeNoteKo || r.sizeNote) : (r.sizeNote || r.sizeNoteKo);
                    return sn ? (
                      <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-mono)', color: isCrit ? 'var(--color-error)' : 'var(--color-warning)', lineHeight: 1.4 }}>
                        {sn}
                      </p>
                    ) : null;
                  })()}
                  {(() => {
                    // 선택 언어 우선, 없으면 반대 언어로 폴백.
                    const note = language === 'ko' ? (r.llmNoteKo || r.llmNote) : (r.llmNote || r.llmNoteKo);
                    return note ? (
                      <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {note}
                      </p>
                    ) : null;
                  })()}
                  {(() => {
                    // golden path — "대신 이렇게 하라" 안전 대안. accent 색 + 라벨로 구분.
                    const sug = language === 'ko' ? (r.suggestionKo || r.suggestion) : (r.suggestion || r.suggestionKo);
                    return sug ? (
                      <p style={{ margin: '8px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>{language === 'ko' ? '권장 ' : 'Suggested '}</span>
                        {sug}
                      </p>
                    ) : null;
                  })()}
                </div>
                );
              })}
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
                  미리 본 {count}건의 변경이 단일 트랜잭션으로 데이터베이스에 적용됩니다.
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
