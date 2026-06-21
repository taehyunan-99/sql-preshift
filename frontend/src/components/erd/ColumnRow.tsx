'use client';

import type { ColumnDef } from '../../lib/api';

const DIFF_BAR_COLOR: Record<string, string> = {
  added: 'var(--color-success)',
  removed: 'var(--color-error)',
  modified: 'var(--color-warning)',
  unchanged: 'transparent',
};

interface Props {
  column: ColumnDef;
}

export default function ColumnRow({ column }: Props) {
  const barColor = DIFF_BAR_COLOR[column.diff] ?? 'transparent';
  const isModified = column.diff === 'modified' && column.change;
  const isRemoved = column.diff === 'removed';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 28,
        fontSize: 12,
        borderTop: '1px solid var(--border)',
        position: 'relative',
        paddingLeft: 12,
        paddingRight: 8,
        paddingTop: isModified ? 4 : 0,
        paddingBottom: isModified ? 4 : 0,
        gap: 6,
        background: 'var(--bg-secondary)',
        flexWrap: 'wrap',
      }}
    >
      {/* diff 컬러바 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: barColor,
          borderRadius: '2px 0 0 2px',
        }}
      />

      {/* PK / FK 아이콘 */}
      {column.pk && (
        <span title="Primary Key" style={{ fontSize: 11, flexShrink: 0 }}>🔑</span>
      )}
      {column.fk && !column.pk && (
        <span title={`FK → ${column.fk}`} style={{ fontSize: 11, flexShrink: 0 }}>🔗</span>
      )}
      {!column.pk && !column.fk && (
        <span style={{ width: 15, display: 'inline-block', flexShrink: 0 }} />
      )}

      {/* 컬럼 이름 — removed면 취소선 + error 색으로 "삭제" 강조 */}
      <span
        style={{
          flex: 1,
          color: isRemoved
            ? 'var(--color-error)'
            : column.pk
              ? 'var(--text-primary)'
              : 'var(--text-secondary)',
          fontWeight: column.pk ? 700 : 400,
          textDecoration: isRemoved ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 60,
        }}
      >
        {column.name}
      </span>

      {/* 타입 칩 — modified면 from→to 표시 */}
      {isModified ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span
            style={{
              background: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              textDecoration: 'line-through',
            }}
          >
            {column.change!.from}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>→</span>
          <span
            style={{
              background: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
            }}
          >
            {column.change!.to}
          </span>
        </span>
      ) : (
        <span
          style={{
            background: 'var(--bg-tertiary)',
            color: isRemoved ? 'var(--color-error)' : 'var(--text-secondary)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            flexShrink: 0,
            textDecoration: isRemoved ? 'line-through' : 'none',
          }}
        >
          {column.type}
        </span>
      )}
    </div>
  );
}
