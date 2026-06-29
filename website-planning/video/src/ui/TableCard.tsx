import React from 'react';
import { C, RGB, FONT } from '../theme';

// 실제 앱 TableNode.tsx의 시각을 재현한 정적 카드.
// diff 배지/컬럼 컬러바/헤더 틴트/glow ring을 동일한 색 언어로 그린다.
// 영상용이라 xyflow/handle은 생략하고 시각 결과만 재현.

export type ColDiff = 'added' | 'removed' | 'modified' | 'unchanged';

export interface Col {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  diff?: ColDiff;
  change?: { from: string; to: string };
}

export type NodeDiff = 'added' | 'removed' | 'modified' | 'unchanged';

const DIFF_BADGE: Record<NodeDiff, { label: string; color: string } | null> = {
  added: { label: '+Added', color: C.added },
  removed: { label: '−Removed', color: C.removed },
  modified: { label: '~Modified', color: C.modified },
  unchanged: null,
};

const ACCENT: Record<NodeDiff, string> = {
  added: C.added,
  removed: C.removed,
  modified: C.modified,
  unchanged: C.border,
};

const RGB_MAP: Record<NodeDiff, string> = {
  added: RGB.added,
  removed: RGB.removed,
  modified: RGB.modified,
  unchanged: '0,0,0',
};

const BAR_COLOR: Record<ColDiff, string> = {
  added: C.added,
  removed: C.removed,
  modified: C.modified,
  unchanged: 'transparent',
};

// 유리 다층 그림자 — 앱 GLASS_SHADOW 축약 재현.
const GLASS =
  'inset 0 0 0 1px rgba(255,255,255,0.07),' +
  'inset 0 1px 0 0 rgba(255,255,255,0.16),' +
  'inset 0 -1px 0 0 rgba(0,0,0,0.40),' +
  '0 4px 12px rgba(0,0,0,0.38),' +
  '0 16px 48px rgba(0,0,0,0.34)';

interface Props {
  table: string;
  columns: Col[];
  diff?: NodeDiff;
  // glow 강도(0~1) — Diff Bloom 등장 애니용. 1=완전 발광.
  glow?: number;
  width?: number;
}

export const TableCard: React.FC<Props> = ({
  table,
  columns,
  diff = 'unchanged',
  glow = 1,
  width = 280,
}) => {
  const badge = DIFF_BADGE[diff];
  const isChanged = diff !== 'unchanged';
  const accent = ACCENT[diff];
  const rgb = RGB_MAP[diff];

  // 변경 노드의 ring + halo — glow 값으로 강도 보간(등장 시 0→1).
  // halo spread를 줄여(28→16) amber/teal이 섞여 번지지 않고 또렷하게 읽히게 한다.
  // 과한 halo는 8bit 압축에서 노이즈/banding도 유발하므로 alpha도 낮춘다.
  const ring = isChanged
    ? `inset 0 0 0 2px ${accent}, 0 0 ${8 * glow}px -2px rgba(${rgb},${0.4 * glow}), 0 0 ${16 * glow}px ${2 * glow}px rgba(${rgb},${0.28 * glow})`
    : '';
  const boxShadow = isChanged ? `${ring}, ${GLASS}` : GLASS;

  // 헤더 동색 틴트 — 변경 노드만. alpha를 낮춰(0.22→0.16) 색이 탁해지지 않게.
  const headerTint = isChanged ? `rgba(${rgb}, ${0.16 * glow})` : 'transparent';

  return (
    <div
      style={{
        width,
        borderRadius: 12,
        background: `linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 42%), ${C.surfaceHi}`,
        boxShadow,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: FONT.sans,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          height: 46,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          background: isChanged
            ? `linear-gradient(${headerTint}, ${headerTint}), ${C.surfaceHi}`
            : C.surfaceHi,
          gap: 8,
          borderBottom: '1px solid rgba(0,0,0,0.25)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>{table}</span>
        {badge && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: badge.color,
              color: C.inverse,
              borderRadius: 4,
              padding: '2px 7px',
              opacity: glow,
            }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* 컬럼 */}
      {columns.map((col) => {
        const cd = col.diff ?? 'unchanged';
        const isRemoved = cd === 'removed';
        const isMod = cd === 'modified' && col.change;
        // added/modified 컬럼은 glow에 맞춰 페이드인(등장 강조).
        const colOpacity = cd === 'added' ? glow : 1;
        return (
          <div
            key={col.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '4px 20px 1fr auto',
              alignItems: 'center',
              columnGap: 9,
              minHeight: 34,
              fontSize: 13,
              borderTop: `1px solid ${C.border}`,
              paddingRight: 12,
              background: C.surface,
              opacity: colOpacity,
            }}
          >
            {/* zone1: diff 컬러바 */}
            <div style={{ alignSelf: 'stretch', background: BAR_COLOR[cd], borderRadius: '2px 0 0 2px' }} />
            {/* zone2: 키 레일 */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
                background: C.surfaceHi,
                borderRight: `1px solid ${C.border}`,
                color: col.pk ? C.accent : col.fk ? C.modified : 'transparent',
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {col.pk ? 'PK' : col.fk ? 'FK' : ''}
            </span>
            {/* zone3: 이름 */}
            <span
              style={{
                color: isRemoved ? C.removed : col.pk ? C.text : C.textDim,
                fontWeight: col.pk ? 700 : 400,
                textDecoration: isRemoved ? 'line-through' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {col.name}
            </span>
            {/* zone4: 타입칩 (modified면 from→to) */}
            {isMod ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifySelf: 'end' }}>
                <span
                  style={{
                    background: `rgba(${RGB.removed},0.12)`,
                    color: C.removed,
                    borderRadius: 3,
                    padding: '1px 6px',
                    fontSize: 11,
                    textDecoration: 'line-through',
                    fontFamily: FONT.mono,
                  }}
                >
                  {col.change!.from}
                </span>
                <span style={{ color: C.textDim, fontSize: 11 }}>→</span>
                <span
                  style={{
                    background: `rgba(${RGB.added},0.12)`,
                    color: C.added,
                    borderRadius: 3,
                    padding: '1px 6px',
                    fontSize: 11,
                    fontFamily: FONT.mono,
                  }}
                >
                  {col.change!.to}
                </span>
              </span>
            ) : (
              <span
                style={{
                  background: C.surfaceHi,
                  color: isRemoved ? C.removed : C.textDim,
                  borderRadius: 3,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontFamily: FONT.mono,
                  textDecoration: isRemoved ? 'line-through' : 'none',
                  justifySelf: 'end',
                }}
              >
                {col.type}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
