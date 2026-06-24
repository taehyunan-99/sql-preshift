'use client';

import { memo } from 'react';
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

// Broken RI 경고 — 작은 경고 삼각(느낌표). removed의 텍스트 strikethrough와 형태로 구별돼
// diff-red(삭제)와 의미 충돌 없음. 데이터 레이어 신호라 schema-diff와 별도 채널.
function BrokenIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Broken referential integrity"
    >
      <path d="M8 2 L14.5 13.5 H1.5 Z" />
      <path d="M8 6.5 V9.5" />
      <circle cx="8" cy="11.6" r="0.5" fill="currentColor" />
    </svg>
  );
}

interface Props {
  column: ColumnDef;
}

// React.memo — 부모 TableNode 리렌더 시 컬럼 row 재계산을 막는다. column(ColumnDef)은
// useErdLayout의 안정 참조(node.data) 하위라 기본 shallow 비교로 충분.
function ColumnRow({ column }: Props) {
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

  // 무결성 진단: 추정 FK(naming 휴리스틱) — 실제 FK 아님. 옅은 회색 FkIcon으로 estimated 표시.
  // 백엔드는 실제 fk가 있는 컬럼엔 implicitFkHint를 안 채워 상호배타(실 FK 우선).
  const isImplicitFk = !column.fk && !!column.implicitFkHint;

  // 무결성 진단: broken RI(진짜 깨진 데이터, warning 아이콘) vs soft-delete 부모 참조(informational gray).
  // removed는 컬럼명 strikethrough(텍스트)라, broken은 아이콘 형태로 구별 → diff-red와 비충돌.
  const isBroken = !!column.brokenReferential && !isRemoved;
  const isSoftRef = !!column.softDeletedParentRef && !isRemoved && !isBroken;

  const keyColor = column.pk
    ? 'var(--color-accent)' // PK=teal (식별자=브랜드)
    : column.fk
      ? 'var(--color-warning)' // FK=amber (핸들/엣지색 통일)
      : isImplicitFk
        ? 'var(--text-tertiary)' // 추정 FK=중립 회색 (확정 amber와 구분)
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
        title={
          column.pk
            ? 'Primary Key'
            : column.fk
              ? `FK → ${column.fk}`
              : isImplicitFk
                ? `Estimated FK → ${column.implicitFkHint} (inferred from naming)`
                : undefined
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
          background: 'var(--bg-tertiary)',
          borderRight: '1px solid var(--border)',
          color: keyColor,
          // 추정 FK는 옅게 — 확정 아이콘과 시각적으로 구분(estimated).
          opacity: isImplicitFk ? 0.6 : 1,
        }}
      >
        {column.pk ? <PkIcon /> : column.fk || isImplicitFk ? <FkIcon /> : null}
      </span>

      {/* zone3: 컬럼명 — removed면 취소선 + error 색. 무결성 broken/soft 마커를 이름 뒤에. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
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
        {/* broken RI — error 색 경고 삼각(아이콘 형태라 diff-red 텍스트와 충돌 없음) */}
        {isBroken && (
          <span
            style={{ color: 'var(--color-error)', display: 'flex', flexShrink: 0 }}
            title="Some values reference a missing parent row (broken referential integrity)"
          >
            <BrokenIcon />
          </span>
        )}
        {/* soft-delete 부모 참조 — informational 중립 배지(경고색 금지, 논리적 broken/물리 행 존재).
            기존 5px 점은 너무 작아 안 읽혔다 → 외곽선 있는 텍스트 칩으로 가시성↑(broken 삼각과 형태 구별). */}
        {isSoftRef && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.04em',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 3,
              padding: '2px 4px',
            }}
            title="References a soft-deleted parent row (logically broken, physically intact)"
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--text-tertiary)',
              }}
            />
            soft-del
          </span>
        )}
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifySelf: 'end' }}>
          {/* 무결성 진단: near-saturation NULL FK — 중립 힌트(경고 아님). 거의 안 쓰이는 vestigial
              FK 가능성. amber(=modified 의미)가 아닌 중립색 — 정상 optional FK를 병리화하지 않는다.
              pg_stats.null_frac 기반 estimated → title로 ANALYZE 캐비엇. */}
          {column.highNullRatio != null && !isRemoved && (
            <span
              style={{
                color: 'var(--text-tertiary)',
                fontSize: 9,
                whiteSpace: 'nowrap',
              }}
              title="Rarely populated FK, estimated from last ANALYZE (may be stale)"
            >
              Rarely populated
            </span>
          )}
          <span
            style={{
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
        </span>
      )}
    </div>
  );
}

export default memo(ColumnRow);
