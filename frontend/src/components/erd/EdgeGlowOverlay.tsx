'use client';

import { useNodes, useViewport, useStore } from '@xyflow/react';
import { useMemo } from 'react';
import type { NodeDef } from '../../lib/api';

// 화면 밖 변경/진단 노드의 "방향"을 ERD 캔버스 4모서리의 은은한 색 글로우로 알린다.
// 위쪽에 added 테이블이 있으면 위 모서리에 초록 글로우 — pan 안 해도 "저쪽에 뭔가 있다"가 보인다.
//
// Safari 안전: 정적 레이어 + opacity 전이만(will-change/translateZ/blur 애니 없음). 합성 레이어 흐림
// 트리거(#27684)를 피하기 위해 radial-gradient 배경만 쓰고 box-shadow blur 애니는 안 쓴다.

// 변/방향별 색 우선순위 — 한 변에 여러 노드면 가장 강한 신호색 1개로(broken>removed>modified>added>orphan).
// rgb는 의미색 hex 분해값(불변). orphan/estimated 등 진단은 중립 회색.
const SIGNAL_RGB = {
  broken: '196,91,91', // error
  removed: '196,91,91', // error
  modified: '196,149,90', // warning
  added: '91,154,111', // success
  diagnostic: '107,118,123', // 중립(text-tertiary 계열) — orphan/implicit/high-null/soft-del
} as const;

type SignalKey = keyof typeof SIGNAL_RGB;
// 우선순위(앞일수록 강함) — 한 변에 여러 신호 섞이면 이 순서로 대표색 결정.
const SIGNAL_PRIORITY: SignalKey[] = ['broken', 'removed', 'modified', 'added', 'diagnostic'];

type Side = 'top' | 'bottom' | 'left' | 'right';

// 노드가 어떤 신호를 갖는지 — diff 우선, 없으면 진단(테이블/컬럼 어디든 신호 있으면 diagnostic).
function nodeSignal(n: NodeDef): SignalKey | null {
  if (n.diff === 'added') return 'added';
  if (n.diff === 'removed') return 'removed';
  if (n.diff === 'modified') return 'modified';
  // diff 없는 노드의 데이터 진단 — broken은 따로(경고색), 그 외는 중립.
  const hasBroken = n.columns.some((c) => c.brokenReferential);
  if (hasBroken) return 'broken';
  const hasDiag =
    n.isOrphan ||
    n.columns.some(
      (c) => c.implicitFkHint || c.highNullRatio != null || c.softDeletedParentRef,
    );
  return hasDiag ? 'diagnostic' : null;
}

const NODE_WIDTH = 240; // erd-layout NODE_WIDTH와 동일(중심 보정용 근사)

export default function EdgeGlowOverlay() {
  const nodes = useNodes();
  const { x: vx, y: vy, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  // 각 변별 대표 신호색 계산 — 화면 밖 노드만, 신호 있는 것만.
  const sides = useMemo(() => {
    const acc: Record<Side, SignalKey | null> = { top: null, bottom: null, left: null, right: null };
    if (!width || !height) return acc;

    // 한 변에 여러 노드면 우선순위 높은 신호로 갱신.
    const consider = (side: Side, sig: SignalKey) => {
      const cur = acc[side];
      if (cur == null || SIGNAL_PRIORITY.indexOf(sig) < SIGNAL_PRIORITY.indexOf(cur)) {
        acc[side] = sig;
      }
    };

    for (const node of nodes) {
      const data = node.data as unknown as NodeDef | undefined;
      if (!data) continue;
      const sig = nodeSignal(data);
      if (!sig) continue;

      // 노드 중심의 화면 좌표(graph→screen): pos*zoom + viewport. 높이는 measured 우선.
      const nodeW = node.measured?.width ?? NODE_WIDTH;
      const nodeH = node.measured?.height ?? 80;
      const cx = (node.position.x + nodeW / 2) * zoom + vx;
      const cy = (node.position.y + nodeH / 2) * zoom + vy;

      // 화면 안이면 글로우 불필요(노드가 이미 보임).
      const inside = cx >= 0 && cx <= width && cy >= 0 && cy <= height;
      if (inside) continue;

      // 화면 밖 — 어느 변 쪽으로 벗어났는지(가장 많이 벗어난 축). 모서리는 두 변 다 칠함.
      if (cx < 0) consider('left', sig);
      else if (cx > width) consider('right', sig);
      if (cy < 0) consider('top', sig);
      else if (cy > height) consider('bottom', sig);
    }
    return acc;
  }, [nodes, vx, vy, zoom, width, height]);

  // 변별 글로우 그라데이션 — 해당 변에서 안쪽으로 28% 페이드. 색 없으면 투명.
  const grad = (side: Side): string => {
    const sig = sides[side];
    if (!sig) return 'transparent';
    const rgb = SIGNAL_RGB[sig];
    const dir = { top: 'to bottom', bottom: 'to top', left: 'to right', right: 'to left' }[side];
    // alpha 0.22 — 은은하게(과하면 캔버스 가독성 해침). 안쪽으로 빠르게 사라짐.
    return `linear-gradient(${dir}, rgba(${rgb},0.22), transparent 28%)`;
  };

  // 4변을 각각 얇은 absolute 띠로(겹치는 모서리는 두 띠가 합성 → 모서리 강조 자연 발생).
  const band = (side: Side): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      pointerEvents: 'none',
      background: grad(side),
      opacity: sides[side] ? 1 : 0,
      transition: 'opacity var(--transition-base), background var(--transition-base)',
    };
    const THICK = 64; // 띠 두께(px)
    if (side === 'top') return { ...base, top: 0, left: 0, right: 0, height: THICK };
    if (side === 'bottom') return { ...base, bottom: 0, left: 0, right: 0, height: THICK };
    if (side === 'left') return { ...base, top: 0, bottom: 0, left: 0, width: THICK };
    return { ...base, top: 0, bottom: 0, right: 0, width: THICK };
  };

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      <div style={band('top')} />
      <div style={band('bottom')} />
      <div style={band('left')} />
      <div style={band('right')} />
    </div>
  );
}
