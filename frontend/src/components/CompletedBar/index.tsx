'use client';

import { usePipelineStore } from '../../store/pipeline';

// stage==='applied'에서만 렌더되는 하단 중앙 floating pill
// [롤백][새 작업] — 롤백은 최근 적용 auditId가 store 계약에 없어 AuditDrawer를 열어 롤백을 수행하게 위임
export default function CompletedBar() {
  const { stage, reset, openAudit, language } = usePipelineStore();

  if (stage !== 'applied') return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
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
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-success)',
          marginRight: 4,
        }}
      >
        {language === 'ko' ? '✓ 적용됨' : '✓ Applied'}
      </span>

      {/* 롤백 — AuditDrawer를 열어 최근 적용 항목 롤백 */}
      <button
        onClick={openAudit}
        style={{
          padding: '6px 14px',
          fontSize: 12,
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-error-border)',
          background: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {language === 'ko' ? '롤백' : 'Rollback'}
      </button>

      {/* 새 작업 — 파이프라인 초기화 */}
      <button
        onClick={reset}
        style={{
          padding: '6px 14px',
          fontSize: 12,
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-accent-border)',
          background: 'var(--color-accent-20)',
          color: 'var(--color-accent)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {language === 'ko' ? '새 작업' : 'New'}
      </button>
    </div>
  );
}
