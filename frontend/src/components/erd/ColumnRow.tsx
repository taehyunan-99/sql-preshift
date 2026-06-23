'use client';

import { useDiffEmphasis } from '../../store/erdLab';
import type { ColumnDef } from '../../lib/api';

const DIFF_BAR_COLOR: Record<string, string> = {
  added: 'var(--color-success)',
  removed: 'var(--color-error)',
  modified: 'var(--color-warning)',
  unchanged: 'transparent',
};

// subtle 변형용 raw rgb(반투명 합성 — rgba 토큰은 인라인 alpha 조합 불가). semantic hex 불변.
const DIFF_BAR_RGB: Record<string, string> = {
  added: '91,154,111',
  removed: '196,91,91',
  modified: '196,149,90',
  unchanged: '0,0,0',
};

// PK — 추상 키: 채운 식별자 도트 + 비트 라인. 형태로도 FK와 구분(색맹 대비).
function PkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Primary key"
    >
      <circle cx="5.5" cy="5.5" r="2.75" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="5.5" r="2.75" />
      <path d="M7.4 7.4 L13 13 M11 11 L12.5 9.5 M12.4 12.4 L14 10.8" />
    </svg>
  );
}

// FK — anchor-link: 점→화살촉→점 (관계 + 방향). 형태로도 PK와 구분.
function FkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Foreign key"
    >
      <circle cx="3.25" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4.85 8 H10.5" />
      <path d="M9 6 L11 8 L9 10" />
      <circle cx="12.5" cy="8" r="1.6" />
    </svg>
  );
}

interface Props {
  column: ColumnDef;
}

export default function ColumnRow({ column }: Props) {
  const isModified = column.diff === 'modified' && column.change;
  const isRemoved = column.diff === 'removed';

  // diff 표현 방식 — 캔버스별 Context override 우선(동시 비교), 없으면 전역 store. 의미색 불변.
  const emphasis = useDiffEmphasis();
  const isChangedCol = column.diff !== 'unchanged';
  const barColor = !isChangedCol
    ? 'transparent'
    : emphasis === 'subtle'
      ? `rgba(${DIFF_BAR_RGB[column.diff] ?? '0,0,0'},0.7)`
      : (DIFF_BAR_COLOR[column.diff] ?? 'transparent');
  const barWidth = emphasis === 'subtle' ? 3 : 4; // gridTemplateColumns 첫 트랙

  const keyColor = column.pk
    ? 'var(--color-accent)' // PK=teal (식별자=브랜드)
    : column.fk
      ? 'var(--color-warning)' // FK=amber (핸들/엣지색 통일)
      : 'transparent';

  return (
    <div
      style={{
        // 4-zone grid: diff거터 | 키레일 | 이름 | 타입칩. flexWrap 폐기 → 한 줄 고정.
        display: 'grid',
        gridTemplateColumns: `${barWidth}px 18px 1fr auto`,
        alignItems: 'center',
        columnGap: 8,
        minHeight: 30,
        fontSize: 12,
        borderTop: '1px solid var(--border)',
        position: 'relative',
        paddingRight: 10,
        background: 'var(--bg-secondary)', // 불투명 — blur 없음
      }}
    >
      {/* zone1: diff 컬러바 (글로벌 룰) */}
      <div
        style={{
          alignSelf: 'stretch',
          background: barColor,
          borderRadius: '2px 0 0 2px',
        }}
      />

      {/* zone2: 불투명 키 레일 + SVG 아이콘 (아이콘이 glass 위에 직접 안 놓이게) */}
      <span
        title={column.pk ? 'Primary Key' : column.fk ? `FK → ${column.fk}` : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
          background: 'var(--bg-tertiary)',
          borderRight: '1px solid var(--border)',
          color: keyColor,
        }}
      >
        {column.pk ? <PkIcon /> : column.fk ? <FkIcon /> : null}
      </span>

      {/* zone3: 컬럼명 — removed면 취소선 + error 색 */}
      <span
        style={{
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
        }}
      >
        {column.name}
      </span>

      {/* zone4: 타입 칩 — modified면 from→to */}
      {isModified ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, justifySelf: 'end' }}>
          <span
            style={{
              background: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              textDecoration: 'line-through',
              fontFamily: 'var(--font-mono)',
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
              fontFamily: 'var(--font-mono)',
            }}
          >
            {column.change!.to}
          </span>
        </span>
      ) : (
        <span
          style={{
            justifySelf: 'end',
            background: 'var(--bg-tertiary)',
            color: isRemoved ? 'var(--color-error)' : 'var(--text-secondary)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            textDecoration: isRemoved ? 'line-through' : 'none',
          }}
        >
          {column.type}
        </span>
      )}
    </div>
  );
}
