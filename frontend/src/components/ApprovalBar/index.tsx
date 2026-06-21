'use client';

import { useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';
import { applySQL } from '../../lib/api';

export default function ApprovalBar() {
  const { stage, analyzeResult, reset, setStage } = usePipelineStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (stage !== 'preview' || !analyzeResult) return null;

  const hasCritical = analyzeResult.hasCritical;

  const handleApply = async () => {
    if (hasCritical && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);
    setIsApplying(true);
    setStage('applying');
    setError(null);
    try {
      await applySQL(analyzeResult.token);
      setStage('applied');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
      setStage('preview');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <div
        style={{
          // 하단 중앙 floating pill
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
        {/* 위험 배지 */}
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
            ⚠ CRITICAL
          </span>
        )}

        <span style={{ flex: 1 }} />

        {error && (
          <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{error}</span>
        )}

        {/* 취소 */}
        <button
          onClick={reset}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>

        {/* Dry-run 다시 */}
        <button
          onClick={() => setStage('analyzing')}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Dry-run
        </button>

        {/* 승인 후 적용 */}
        <button
          onClick={handleApply}
          disabled={isApplying}
          title={hasCritical ? 'Critical risk present. Click to open the confirmation dialog.' : undefined}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid var(--color-accent-border)',
            background: isApplying ? 'var(--color-accent-10)' : 'var(--color-accent-20)',
            color: 'var(--color-accent)',
            cursor: isApplying ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: isApplying ? 0.6 : 1,
          }}
        >
          {isApplying ? 'Applying…' : 'Apply'}
        </button>
      </div>

      {/* Critical 확인 모달 */}
      {confirmOpen && (
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
              border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--color-error)',
              }}
            >
              ⚠ Critical risk warning
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This SQL contains a critical risk. Are you sure you want to apply it?
              <br />
              Applying it may cause data loss.
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
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: '7px 16px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--color-error)',
                  background: 'var(--color-error-bg)',
                  color: 'var(--color-error)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Acknowledge & apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
