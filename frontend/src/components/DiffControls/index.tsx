'use client';

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
            {/* "Showing X of Y tables (N-hop)" 카운터 — 좁힘이 의도된 축약임을 알린다 */}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {showAll
                ? `All ${totalCount} tables`
                : `Showing ${shownCount} of ${totalCount} (${hops}-hop)`}
            </span>
            {/* hop 토글 — 부분집합 모드(showAll=false)에서만 */}
            {!showAll && (
              <div style={{ display: 'flex', gap: 4 }}>
                {HOP_OPTIONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => onHopsChange?.(h)}
                    style={neutralBtn(hops === h)}
                    title={`Show tables within ${h} FK hops of the change`}
                  >
                    {h}-hop
                  </button>
                ))}
              </div>
            )}
            {/* Show all 토글 — 전체 스키마 옵트인(작은 DB는 전체가 임팩트) */}
            <button
              onClick={() => onShowAllChange?.(!showAll)}
              style={neutralBtn(showAll)}
              title={showAll ? 'Show only the changed neighborhood' : 'Show the full schema'}
            >
              {showAll ? 'Show subset' : 'Show all'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
