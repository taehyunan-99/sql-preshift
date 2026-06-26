'use client';

import { usePipelineStore } from '../../store/pipeline';

// ErdDiffViewer의 mode 타입과 동일 (lift-up된 상태를 props로 공유)
export type DiffMode = 'side-by-side' | 'overlay';

interface DiffControlsProps {
  value: DiffMode;
  onChange: (mode: DiffMode) => void;
  // page가 stage별 reveal(opacity/visibility 등)을 주입 — 위치는 컴포넌트가 self-position.
  style?: React.CSSProperties;
  // n홉 부분집합 카운터·토글 — 입력이 닿는 테이블 기준 n홉만 그리는 큰 DB 성능 장치.
  shownCount?: number; // 현재 표시 중인 테이블 수
  totalCount?: number; // 전체 테이블 수
  hops?: number; // 현재 hop 단계
  showAll?: boolean; // 전체 스키마 표시 여부
  onHopsChange?: (hops: number) => void;
  onShowAllChange?: (showAll: boolean) => void;
}

// hop 선택지 — 2단계(기본)와 3단계. 더 넓히면 부분집합 의미가 옅어진다.
const HOP_OPTIONS = [2, 3];

// diff 3색 범례 (색 의미 불변). 라벨은 영어 source-of-truth + 한국어 보조.
const LEGEND = [
  { color: 'var(--color-success)', label: 'Added', labelKo: '추가' },
  { color: 'var(--color-error)', label: 'Removed', labelKo: '삭제' },
  { color: 'var(--color-warning)', label: 'Modified', labelKo: '변경' },
];

// 뷰 토글 라벨 — git diff 표준 용어(Split/Unified). mode 값은 내부 식별자라 유지.
const MODES: { mode: DiffMode; label: string }[] = [
  { mode: 'side-by-side', label: 'Split' },
  { mode: 'overlay', label: 'Unified' },
];

// 우상단 floating: DiffLegend + side/overlay 모드 토글 묶음
// ★모드토글 active 색은 중립(--bg-tertiary + text-primary + border-strong) — ERD 영역이라 accent·diff색 금지
export default function DiffControls({
  value,
  onChange,
  style,
  shownCount,
  totalCount,
  hops = 2,
  showAll = false,
  onHopsChange,
  onShowAllChange,
}: DiffControlsProps) {
  const language = usePipelineStore((s) => s.language);
  const ko = language === 'ko';
  // 부분집합 컨트롤은 카운터 정보가 들어왔고 전체보다 적게 보일 수 있을 때만 노출.
  const hasSubset = shownCount !== undefined && totalCount !== undefined && totalCount > 0;
  // active=중립색(ERD 영역이라 accent·diff색 금지) — 기존 모드토글 규칙과 동일.
  const neutralBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    background: active ? 'var(--bg-tertiary)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
  });
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
        {LEGEND.map(({ color, label, labelKo }) => (
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
            {ko ? labelKo : label}
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
            <button key={mode} onClick={() => onChange(mode)} style={neutralBtn(active)}>
              {label}
            </button>
          );
        })}
      </div>

      {/* n홉 부분집합 컨트롤 — 카운터 + hop 토글 + Show all */}
      {hasSubset && (
        <>
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* "Showing X of Y (N levels deep)" 카운터 — "홉"은 일반 사용자에게 안 읽혀
                "관계 깊이(levels)"로 표기. 변경 테이블 기준 N단계 이내 이웃을 보여준다. */}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {showAll
                ? ko
                  ? `전체 ${totalCount}개 테이블`
                  : `All ${totalCount} tables`
                : ko
                  ? `${totalCount}개 중 ${shownCount}개 표시 (관련 ${hops}단계)`
                  : `Showing ${shownCount} of ${totalCount} (${hops} levels deep)`}
            </span>
            {/* 관계 깊이 토글 — 부분집합 모드(showAll=false)에서만 */}
            {!showAll && (
              <div style={{ display: 'flex', gap: 4 }}>
                {HOP_OPTIONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => onHopsChange?.(h)}
                    style={neutralBtn(hops === h)}
                    title={
                      ko
                        ? `변경된 테이블에서 관계 ${h}단계 이내 테이블 표시`
                        : `Show tables within ${h} relationship level${h === 1 ? '' : 's'} of the changed tables`
                    }
                  >
                    {ko ? `${h}단계` : `${h} level${h === 1 ? '' : 's'}`}
                  </button>
                ))}
              </div>
            )}
            {/* Show all 토글 — 전체 스키마 옵트인(작은 DB는 전체가 임팩트) */}
            <button
              onClick={() => onShowAllChange?.(!showAll)}
              style={neutralBtn(showAll)}
              title={
                showAll
                  ? ko
                    ? '변경된 주변만 표시'
                    : 'Show only the changed neighborhood'
                  : ko
                    ? '전체 스키마 표시'
                    : 'Show the full schema'
              }
            >
              {showAll ? (ko ? '부분집합 보기' : 'Show subset') : ko ? '전체 보기' : 'Show all'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
