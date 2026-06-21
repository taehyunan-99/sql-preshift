'use client';

const ITEMS = [
  { color: 'var(--color-success)', label: 'Added' },
  { color: 'var(--color-error)', label: 'Removed' },
  { color: 'var(--color-warning)', label: 'Modified' },
];

export default function DiffLegend() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
    >
      {ITEMS.map(({ color, label }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: color,
              display: 'inline-block',
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
