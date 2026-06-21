'use client';

// ErdDiffViewer의 mode 타입과 동일 (lift-up된 상태를 props로 공유)
export type DiffMode = 'side-by-side' | 'overlay';

interface DiffControlsProps {
  value: DiffMode;
  onChange: (mode: DiffMode) => void;
  // page가 stage별 reveal(opacity/visibility 등)을 주입 — 위치는 컴포넌트가 self-position.
  style?: React.CSSProperties;
}

// diff 3색 범례 (색 의미 불변)
const LEGEND = [
  { color: 'var(--color-success)', label: 'Added' },
  { color: 'var(--color-error)', label: 'Removed' },
  { color: 'var(--color-warning)', label: 'Modified' },
];

// 뷰 토글 라벨 — git diff 표준 용어(Split/Unified). mode 값은 내부 식별자라 유지.
const MODES: { mode: DiffMode; label: string }[] = [
  { mode: 'side-by-side', label: 'Split' },
  { mode: 'overlay', label: 'Unified' },
];

// 우상단 floating: DiffLegend + side/overlay 모드 토글 묶음
// ★모드토글 active 색은 중립(--bg-tertiary + text-primary + border-strong) — ERD 영역이라 accent·diff색 금지
export default function DiffControls({ value, onChange, style }: DiffControlsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 56,
        right: 16,
        zIndex: 35,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 10px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)',
        ...style,
      }}
    >
      {/* 범례 — diff 3색 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        {LEGEND.map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: color,
                display: 'inline-block',
              }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* 구분선 */}
      <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />

      {/* 모드 토글 — active=중립 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {MODES.map(({ mode, label }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              onClick={() => onChange(mode)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                background: active ? 'var(--bg-tertiary)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
