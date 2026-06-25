'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion, useReducedMotion } from 'motion/react';
import ColumnRow from './ColumnRow';
import { useRiskMap } from './ErdDiffViewer';
import { CARD_SURFACE } from './cardStyle';
import { useDiffEmphasis, type DiffEmphasis } from '../../store/erdLab';
import type { NodeDef } from '../../lib/api';

// 유리 다층 그림자 — 본체 바깥에서만 유리감 표현(blur가 텍스트에 영향 0). Apple Liquid Glass식 깊이.
// 가장자리는 inset hairline ring 하나로 통일(별도 border 제거) → radius 어긋남 방지.
// ① 가장자리 hairline ring(테두리 역할, radius와 완전 정합) ② 상단 강한 specular
// ③ 하단 두께 그림자 ④ 가까운 그림자 ⑤ 중간 깊이 ⑥ ambient depth
const GLASS_SHADOW =
  'inset 0 0 0 1px rgba(255,255,255,0.07),' +
  'inset 0 1px 0 0 rgba(255,255,255,0.16),' +
  'inset 0 -1px 0 0 rgba(0,0,0,0.40),' +
  '0 1px 2px rgba(0,0,0,0.40),' +
  '0 4px 12px rgba(0,0,0,0.38),' +
  '0 16px 48px rgba(0,0,0,0.34)';

const DIFF_BADGE: Record<string, { label: string; color: string }> = {
  added: { label: '+Added', color: 'var(--color-success)' },
  removed: { label: '−Removed', color: 'var(--color-error)' },
  modified: { label: '~Modified', color: 'var(--color-warning)' },
  unchanged: { label: '', color: 'transparent' },
};

// diff별 노드 강조용 색 토큰 (보더/글로우 동색)
const DIFF_ACCENT: Record<string, string> = {
  added: 'var(--color-success)',
  removed: 'var(--color-error)',
  modified: 'var(--color-warning)',
  unchanged: 'var(--border)',
};

// diff별 외곽 글로우 (box-shadow blur용, 알파 0.45 — 캔버스 위 또렷). hex는 semantic 동일.
const DIFF_GLOW: Record<string, string> = {
  added: 'var(--color-success-glow)',
  removed: 'var(--color-error-glow)',
  modified: 'var(--color-warning-glow)',
  unchanged: 'transparent',
};

// 위험 배지 (헤더, diff 배지 좌측). 이모지 없이 텍스트 라벨만(글로벌 룰).
const RISK_BADGE: Record<'critical' | 'warning', { color: string; glow: string; label: string }> = {
  critical: { color: 'var(--color-error)', glow: 'var(--color-error-glow-strong)', label: 'CRITICAL' },
  warning: { color: 'var(--color-warning)', glow: 'var(--color-warning-glow-strong)', label: 'WARNING' },
};

// diff별 색광 레이어용 raw rgb (rgba 토큰은 인라인 합성 불가 → hex 분해값). semantic hex 불변.
const DIFF_RGB: Record<string, string> = {
  added: '91,154,111',
  removed: '196,91,91',
  modified: '196,149,90',
  unchanged: '0,0,0',
};

// diff → glow-strong 토큰 키(가까운 진한 halo).
const DIFF_GLOW_STRONG: Record<string, string> = {
  added: 'var(--color-success-glow-strong)',
  removed: 'var(--color-error-glow-strong)',
  modified: 'var(--color-warning-glow-strong)',
  unchanged: 'transparent',
};

// React.memo — xyflow가 nodes 배열을 갱신할 때마다 모든 노드를 리렌더하는 비용을 차단한다.
// 대형 그래프(전체보기) 드래그 시 프레임 드롭 방지(설계 메모: 100노드 10→60 FPS).
// node.data(NodeDef)는 useErdLayout이 useMemo로 안정 참조를 주므로 기본 shallow 비교로 충분.
function TableNode({ data, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const node = data as unknown as NodeDef;
  const badge = DIFF_BADGE[node.diff] ?? DIFF_BADGE.unchanged;
  const isChanged = node.diff !== 'unchanged';
  const accent = DIFF_ACCENT[node.diff] ?? DIFF_ACCENT.unchanged;
  const glow = DIFF_GLOW[node.diff] ?? DIFF_GLOW.unchanged;
  const isRemoved = node.diff === 'removed';

  // diff 표현 방식 — 캔버스별 Context override 우선, 없으면 전역 store. 의미색 불변, 강조 레이어만 분기.
  const emphasis = useDiffEmphasis();
  const showGlowLayer = isChanged && emphasis === 'glow'; // glow에서만 색광 레이어 렌더

  // 위험 level 조회(Context). 매칭 안 되면 undefined → 배지 없음(graceful).
  const riskMap = useRiskMap();
  const riskLevel = riskMap[node.table];
  const risk = riskLevel ? RISK_BADGE[riskLevel] : null;

  // 위험을 어떻게 표시할지: diff가 위험을 이미 그리면(removed/modified) diff 시각 우선,
  // 구조가 안 변하는 위험(DELETE/UPDATE/TRUNCATE → unchanged)만 halo로 표시.
  // 같은 빨강 halo+빗금이 DROP에서 중복되던 문제 해소 + DROP의 제거 표시가 묻히지 않게.
  const showRiskHalo = !!riskLevel && !isChanged;

  // 무결성 진단: FK in/out 둘 다 없는 고립 테이블(추정 아님, 메타데이터 확정). diff 안 난 경우만 표시.
  const isOrphan = !!node.isOrphan && node.diff === 'unchanged';

  // removed는 "사라짐" 암시로 살짝 dim(subtle은 한 단계 더). orphan도 후퇴 의미로 dim(removed보다 약하게).
  // diff/risk 시각이 있는 노드는 그쪽이 우선이라 dim 안 함(중복 신호 방지).
  // (이제 removed에 halo를 안 씌우므로 항상 dim — 제거 신호 유지.)
  const opacity = isRemoved ? (emphasis === 'subtle' ? 0.6 : 0.55) : isOrphan ? 0.6 : 1;

  // 접근성: OS "동작 줄이기" 시 hover lift·발광 애니 비활성.
  const reduceMotion = useReducedMotion();

  // diff 색광(투과 발광) 값.
  const rgb = DIFF_RGB[node.diff] ?? DIFF_RGB.unchanged;
  const glowStrong = DIFF_GLOW_STRONG[node.diff] ?? DIFF_GLOW_STRONG.unchanged;
  // 은은한 글래스 발광(F) — 색광이 내용을 방해하지 않게 peak를 낮춰 '차광유리' 분위기만 남긴다.
  // 색 식별은 헤더 틴트(C)가 책임지므로 발광은 톤만. removed(빨강)만 살짝 강.
  const peakAlpha = isRemoved ? 0.2 : 0.16;

  // 유리 그림자 합성 — 변경 노드는 diff 링/halo를 앞에(우선), 유리 다층을 뒤에.
  // 가장자리는 전부 box-shadow ring으로 그림(border 없음) → radius 정합, 좌상단 어긋남 해소.
  // variant별로 "강조를 얼마나 얹느냐"만 다름(의미색 accent/glow 토큰은 불변):
  //   glow=2단 colored halo / solid=차분한 링+검은 외곽 1px / subtle=얇은 반투명 링만.
  const ringByVariant: Record<DiffEmphasis, string> = {
    glow: `inset 0 0 0 2px ${accent}, 0 0 10px -1px ${glowStrong}, 0 0 28px 4px ${glow}`,
    solid: `inset 0 0 0 2px ${accent}, 0 0 0 1px rgba(0,0,0,0.35)`,
    subtle: `inset 0 0 0 1.5px rgba(${rgb},0.5)`,
  };
  // 구조가 안 변하는 위험(unchanged 노드)만 위험색 halo로 표시 — diff와 동일한 시각언어(inset ring + halo).
  // removed/modified는 diff 링/빗금이 이미 위험을 그리므로 halo를 얹지 않는다(중복 방지).
  const riskRing =
    showRiskHalo && risk
      ? `inset 0 0 0 2px ${risk.color}, 0 0 10px -1px ${risk.glow}, 0 0 28px 4px ${risk.glow}`
      : null;
  const baseShadow = riskRing
    ? `${riskRing}, ${GLASS_SHADOW}`
    : isChanged
    ? `${ringByVariant[emphasis]}, ${GLASS_SHADOW}`
    : GLASS_SHADOW;

  // 헤더 동색 틴트 alpha — 변경 노드 헤더를 의미색으로 물들여 멀리서도 added/removed가 읽히게(C).
  // glow는 은은한 발광(F)으로 톤을 낮춘 대신, 색 식별은 헤더 틴트가 책임진다 → 0.22로 강화.
  const headerTintAlpha: Record<DiffEmphasis, number> = { glow: 0.22, solid: 0.16, subtle: 0.07 };
  const headerTint = `rgba(${rgb}, ${headerTintAlpha[emphasis]})`;

  // removed 빗금 간격 — subtle만 더 성기게(과포화 방지).
  const hatchGap =
    emphasis === 'subtle'
      ? '8px, transparent 8px, transparent 16px'
      : '6px, transparent 6px, transparent 12px';

  // Diff Bloom stagger — 변경 노드가 좌상단부터 대각선 읽기 순서로 '차례로' 피어오른다.
  // 이게 SQLPreShift의 시그니처 모먼트: 입력 → ERD 위로 의미색이 순차 발광 = "변경을
  // 배포 전에 색으로 미리 보기" 그 자체. 동시 발화를 분산해 Safari 합성 부하도 완화한다.
  // 맨해튼 거리(좌상단 원점) 기반: 280px마다 한 스텝, 스텝당 60ms, 최대 0.42s로 클램프.
  const bloomStep = Math.floor((positionAbsoluteX + positionAbsoluteY) / 280);
  const bloomDelay = Math.min(bloomStep * 0.06, 0.42);

  // 색광 레이어 등장 애니 — opacity/scale/filter만(box-shadow 애니 회피, GPU 컴포지터).
  // hover variant 없음 — 노드 hover 효과는 전부 제거(연결 엣지 빛으로만 강조).
  const glowVariants = {
    hidden: { opacity: 0, scale: 0.985, filter: 'blur(18px)' },
    visible: {
      opacity: peakAlpha,
      scale: 1,
      // blur를 키워(10px) 색광에 형체를 없앤다 — 차광유리 너머 번지는 분위기만.
      filter: 'blur(10px)',
      transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay: bloomDelay },
    },
  };

  return (
    // 맨 div — motion.div가 아님. framer-motion은 hardware-acceleration용 translateZ(0)을
    // 요소에 주입해 노드를 자체 GPU 합성 레이어로 승격시키는데, 이 노드가 scale된
    // .react-flow__viewport 안에 있으면 WebKit이 1배 비트맵으로 래스터 후 확대 → 흐림(#27684).
    // 이 root는 애니메이션이 전혀 없어(hover lift 제거, initial=false) motion일 이유가 없다.
    // 실제 애니는 내부 .erd-glow(여전히 motion.div)만 한다.
    <div
      className="erd-card"
      style={{
        minWidth: 240,
        borderRadius: CARD_SURFACE.radius,
        // 본체 + 아주 옅은 vibrancy 틴트(상단 밝게→하단 어둡게) — 유리 표면 질감, 텍스트 대비 영향 없음.
        background: `linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 42%), ${CARD_SURFACE.background}`,
        boxShadow: baseShadow,
        overflow: 'hidden',
        // border 제거 — 가장자리는 box-shadow ring으로 통일(radius 어긋남 방지).
        opacity,
        position: 'relative',
      }}
    >
      {/* diff 색광 투과 레이어 — z0(본문 아래). 가장자리 4면 radial bleed + inner-glow.
          glow 변형에서만 렌더(solid/subtle은 링만). 텍스트는 z1+ 불투명 표면 위라 가독성 무영향. */}
      {showGlowLayer && (
        <motion.div
          className="erd-glow"
          aria-hidden
          variants={reduceMotion ? undefined : glowVariants}
          initial={reduceMotion ? false : 'hidden'}
          animate={reduceMotion ? false : 'visible'}
          style={{
            ...(reduceMotion ? { opacity: peakAlpha, filter: 'blur(10px)' } : null),
            // 4면 radial bleed — 차광유리 분위기로 톤 다운(가장자리에서 안으로 부드럽게 스며만).
            background:
              `radial-gradient(120% 70% at 50% -10%, rgba(${rgb},0.65), transparent 62%),` +
              `radial-gradient(120% 70% at 50% 110%, rgba(${rgb},0.5), transparent 62%),` +
              `radial-gradient(60% 120% at -10% 50%, rgba(${rgb},0.35), transparent 58%),` +
              `radial-gradient(60% 120% at 110% 50%, rgba(${rgb},0.35), transparent 58%)`,
            // inner hairline 약화 — 형체를 만들지 않게(내용 방해 방지).
            boxShadow: `inset 0 0 14px 0 rgba(${rgb},0.3)`,
          }}
        />
      )}
      {/* removed 대각 빗금 오버레이 (클릭 비침범) */}
      {isRemoved && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
            backgroundImage: `repeating-linear-gradient(45deg, var(--color-error-bg) 0, var(--color-error-bg) ${hatchGap})`,
          }}
        />
      )}
      {/* 헤더 */}
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          // 변경 노드만 동색 틴트를 헤더 배경 위에 합성(은은한 보조 단서, variant별 alpha).
          background: isChanged
            ? `linear-gradient(${headerTint}, ${headerTint}), ${CARD_SURFACE.headerBg}`
            : CARD_SURFACE.headerBg,
          gap: 8,
          // 헤더 하단 구분선만(상단 빛선은 카드 ::before/GLASS_SHADOW가 담당 — 곡률 밖 삐짐 방지)
          borderBottom: '1px solid rgba(0,0,0,0.25)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--text-primary)',
            flex: 1,
          }}
        >
          {node.table}
        </span>
        {/* 무결성 진단: 고립 테이블 — 중립 gray 배지(경고 아님, diff색과 무관). risk/diff보다 약한 신호라 앞에. */}
        {isOrphan && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.06em',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 3,
              padding: '2px 5px',
              flexShrink: 0,
            }}
            title="No foreign-key relationships in or out"
          >
            ISOLATED
          </span>
        )}
        {/* 위험 배지 — diff 배지 좌측. 위험이 먼저 읽히도록(우선순위 시각화). 이모지 없이 텍스트만. */}
        {risk && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.06em',
              color: risk.color,
              border: `1px solid ${risk.color}`,
              borderRadius: 3,
              padding: '2px 5px',
              flexShrink: 0,
            }}
          >
            {risk.label}
          </span>
        )}
        {badge.label && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: badge.color,
              color: 'var(--text-inverse)',
              borderRadius: 'var(--radius-sm)',
              padding: '1px 6px',
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* 컬럼 행 */}
      {node.columns.map((col) => (
        <div key={col.name} style={{ position: 'relative' }}>
          {/* FK 소스 핸들 (우측) — 실제 FK 또는 추정 FK(암묵). 추정이면 핸들 색을 옅게(estimated). */}
          {(col.fk || col.implicitFkHint) && (
            <Handle
              type="source"
              position={Position.Right}
              id={col.name}
              style={{
                top: 15,
                background: col.fk ? 'var(--color-warning)' : 'var(--text-tertiary)',
                width: 8,
                height: 8,
              }}
            />
          )}
          {/* PK 타겟 핸들 (좌측) */}
          {col.pk && (
            <Handle
              type="target"
              position={Position.Left}
              id={col.name}
              style={{
                top: 15,
                background: 'var(--color-success)',
                width: 8,
                height: 8,
              }}
            />
          )}
          <ColumnRow column={col} />
        </div>
      ))}
    </div>
  );
}

export default memo(TableNode);
