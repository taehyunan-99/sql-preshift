'use client';

import { usePipelineStore } from '../../store/pipeline';
import type { PipelineStage } from '../../store/pipeline';

// stage별 배지 색/라벨 매핑
// idle=중립(border), analyzing=info, preview=accent, applying=accent, applied=success
const STAGE_STYLE: Record<
  PipelineStage,
  { label: string; color: string; border: string; bg: string }
> = {
  idle: {
    label: 'Ready',
    color: 'var(--text-secondary)',
    border: 'var(--border)',
    bg: 'transparent',
  },
  analyzing: {
    label: 'Analyzing',
    color: 'var(--color-info)',
    border: 'var(--color-info-border)',
    bg: 'var(--color-info-bg)',
  },
  preview: {
    label: 'Preview',
    color: 'var(--color-accent)',
    border: 'var(--color-accent-border)',
    bg: 'var(--color-accent-10)',
  },
  applying: {
    label: 'Applying',
    color: 'var(--color-accent)',
    border: 'var(--color-accent-border)',
    bg: 'var(--color-accent-10)',
  },
  applied: {
    label: 'Applied',
    color: 'var(--color-success)',
    border: 'var(--color-success-border)',
    bg: 'var(--color-success-bg)',
  },
};

export default function StageBadge() {
  const stage = usePipelineStore((s) => s.stage);
  const { label, color, border, bg } = STAGE_STYLE[stage];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${border}`,
        background: bg,
        color,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
