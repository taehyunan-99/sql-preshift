'use client';

import { useEffect, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';
import { rollbackAudit } from '../../lib/api';

// stage==='applied'에서만 렌더되는 하단 중앙 floating pill.
// [Rollback][New] — Rollback은 "방금 적용한 변경 전체"를 역순으로 되돌린다(나중 변경부터).
// 적용 직후의 auditIds(store.lastAppliedAuditIds)를 역순으로 rollbackAudit 호출.
export default function CompletedBar() {
  const { stage, reset, rollbackApplied, language, lastAppliedAuditIds } = usePipelineStore();
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ko = language === 'ko';

  // applied가 아니면(롤백/재적용 등으로 화면을 떠남) 로딩·에러를 리셋 — 컴포넌트가 언마운트되지
  // 않고 return null만 하므로 state가 남는다. 재진입 시 항상 깨끗한 상태에서 시작하도록.
  useEffect(() => {
    if (stage !== 'applied') {
      setRollingBack(false);
      setError(null);
    }
  }, [stage]);

  if (stage !== 'applied') return null;

  const canRollback = lastAppliedAuditIds.length > 0;

  const handleRollback = async () => {
    if (!canRollback || rollingBack) return;
    setRollingBack(true);
    setError(null);
    try {
      // 역순 롤백 — 나중에 적용된 변경부터 되돌려야 FK/의존 순서가 안전.
      for (const id of [...lastAppliedAuditIds].reverse()) {
        await rollbackAudit(id);
      }
      // 성공 — 로딩 해제 후 복원. 이걸 빼먹으면 컴포넌트가 살아있는 채로 rollingBack=true가 남아
      // 재적용(applied 재진입) 시 버튼이 "되돌리는 중…"으로 영구 고정된다.
      setRollingBack(false);
      // Apply 직전 상태로 복원 — DB는 되돌렸고, 프리뷰 스택을 복원해 preview로 복귀(재적용 가능).
      rollbackApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : ko ? '롤백 실패' : 'Rollback failed');
      setRollingBack(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-success)',
            marginRight: 4,
          }}
        >
          {/* 이모지 대신 StageBadge와 동일한 success dot (UI 이모지 금지 규칙) */}
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-success)',
              display: 'inline-block',
            }}
          />
          {ko ? '적용됨' : 'Applied'}
        </span>

        {/* Rollback — 방금 적용한 변경 전체를 역순으로 되돌린다. */}
        <button
          onClick={handleRollback}
          disabled={!canRollback || rollingBack}
          title={
            canRollback
              ? ko
                ? `방금 적용한 ${lastAppliedAuditIds.length}건을 모두 되돌립니다.`
                : `Undo all ${lastAppliedAuditIds.length} change${lastAppliedAuditIds.length === 1 ? '' : 's'} just applied.`
              : ko
                ? '되돌릴 변경이 없습니다.'
                : 'Nothing to roll back.'
          }
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-error-border)',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            cursor: !canRollback || rollingBack ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: !canRollback || rollingBack ? 0.5 : 1,
          }}
        >
          {rollingBack ? (ko ? '되돌리는 중…' : 'Rolling back…') : ko ? '되돌리기' : 'Rollback'}
        </button>

        {/* New — 파이프라인 초기화 */}
        <button
          onClick={reset}
          disabled={rollingBack}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-accent-border)',
            background: 'var(--color-accent-20)',
            color: 'var(--color-accent)',
            cursor: rollingBack ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: rollingBack ? 0.5 : 1,
          }}
        >
          {ko ? '새 작업' : 'New'}
        </button>
      </div>

      {error && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-error)',
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 10px',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
