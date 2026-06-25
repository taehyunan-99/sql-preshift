'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePipelineStore } from '../../store/pipeline';

// 적용 완료 토스트 — applyAll 직후 "N changes applied"를 잠깐 띄워 클라이맥스를 표시(C-2).
// 화면 상단 중앙에서 살짝 내려오며 등장, 일정 시간 후 자동 사라짐.
const AUTO_DISMISS_MS = 2600;

export default function AppliedToast() {
  const appliedToast = usePipelineStore((s) => s.appliedToast);
  const setAppliedToast = usePipelineStore((s) => s.setAppliedToast);
  const language = usePipelineStore((s) => s.language);
  const ko = language === 'ko';

  useEffect(() => {
    if (appliedToast === null) return;
    const id = setTimeout(() => setAppliedToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [appliedToast, setAppliedToast]);

  const n = appliedToast ?? 0;
  const label = ko
    ? `${n}건의 변경이 적용되었습니다`
    : `${n} change${n === 1 ? '' : 's'} applied`;

  return (
    <AnimatePresence>
      {appliedToast !== null && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          // 위에서 떨어져 안착하는 위치 이동 — settle 곡선(.snappy)으로 D 일관 적용.
          transition={{ duration: 0.42, ease: [0.34, 1.2, 0.64, 1] }}
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '10px 18px',
            background: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            borderRadius: 'var(--radius-pill)',
            boxShadow: 'var(--shadow-float)',
            pointerEvents: 'none',
          }}
        >
          {/* success dot — 이모지 대신 CSS 마커(UI 이모지 금지) */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-success)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-success)' }}>
            {label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
