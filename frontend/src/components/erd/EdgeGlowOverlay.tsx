'use client';

import { useNodes, useViewport, useStore } from '@xyflow/react';
import { useMemo } from 'react';
import type { NodeDef } from '../../lib/api';
import { useRiskMap } from './ErdDiffViewer';

// 화면 밖 변경/진단 노드의 "위치"를 ERD 캔버스 가장자리의 작은 색 글로우 점으로 알린다.
// 변 전체를 칠하지 않고, 화면 밖 노드 각각을 가장 가까운 가장자리에 투영해 그 지점에만 점을 찍는다.
// → "저 방향 저 높이에 added 테이블이 있다"가 보이고, 화면에 들어오면 점은 사라진다.
//
// Safari 안전: 정적 레이어 + opacity 전이만(will-change/translateZ/blur 애니 없음). 합성 레이어 흐림
// 트리거(#27684)를 피하기 위해 radial-gradient 배경만 쓰고 box-shadow blur 애니는 안 쓴다.

// 신호별 색 — 변경분(diff)만. removed>modified>added 순으로 강함(겹치면 강한 색 우선).
// rgb는 의미색 hex 분해값(불변). 진단(orphan/broken 등)은 glow 대상이 아니다(변경분만).
const SIGNAL_RGB = {
  removed: '196,91,91', // error
  modified: '196,149,90', // warning
  added: '91,154,111', // success
} as const;

type SignalKey = keyof typeof SIGNAL_RGB;
const SIGNAL_RANK: Record<SignalKey, number> = {
  removed: 0,
  modified: 1,
  added: 2,
};

// 노드가 어떤 신호를 갖는지 — 변경 diff(added/removed/modified) + 위험 테이블(critical/warning).
// FK·DEFAULT 추가처럼 diff엔 안 잡히지만 위험 테두리가 뜨는 테이블도 화면 밖이면 빛내야 한다.
// 색은 의미색 통일: critical=removed색(빨강), warning=modified색(주황).
function nodeSignal(n: NodeDef, risk: 'critical' | 'warning' | undefined): SignalKey | null {
  if (n.diff === 'added') return 'added';
  if (n.diff === 'removed') return 'removed';
  if (n.diff === 'modified') return 'modified';
  if (risk === 'critical') return 'removed'; // 빨강(error)
  if (risk === 'warning') return 'modified'; // 주황(warning)
  return null;
}

const NODE_WIDTH = 240; // erd-layout NODE_WIDTH와 동일(중심 보정용 근사)
const SPREAD = 260; // 글로우가 가장자리 따라 퍼지는 길이(px)
const DEPTH = 120; // 가장자리에서 안쪽으로 스며드는 깊이(px)
const MERGE = 200; // 근접 노드 병합 거리(px)

type Side = 'top' | 'bottom' | 'left' | 'right';

// 화면 밖 노드 하나를 가장자리에 투영한 aurora 글로우.
// 동그란 점이 아니라, 노드가 붙은 변에서 안쪽으로 스며드는 타원형 bloom.
interface GlowDot {
  side: Side; // 어느 변에 붙었는지 — 안쪽 방향과 타원 방향 결정
  // 변을 따라가는 좌표(left변/right변이면 top, top변/bottom변이면 left). 가장자리에 클램프됨.
  along: number;
  sig: SignalKey;
}

export default function EdgeGlowOverlay() {
  const nodes = useNodes();
  const riskMap = useRiskMap();
  const { x: vx, y: vy, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  // 화면 밖(가장자리 너머) 신호 노드만 가장자리에 투영 → 점 목록.
  // 같은 위치(±DOT)에 여러 신호가 겹치면 가장 강한 색만 남긴다.
  const dots = useMemo<GlowDot[]>(() => {
    if (!width || !height) return [];
    const raw: GlowDot[] = [];

    for (const node of nodes) {
      const data = node.data as unknown as NodeDef | undefined;
      if (!data) continue;
      const sig = nodeSignal(data, riskMap[data.table]);
      if (!sig) continue;

      // 노드 중심의 화면 좌표(graph→screen): pos*zoom + viewport. 크기는 measured 우선.
      const nodeW = node.measured?.width ?? NODE_WIDTH;
      const nodeH = node.measured?.height ?? 80;
      const cx = (node.position.x + nodeW / 2) * zoom + vx;
      const cy = (node.position.y + nodeH / 2) * zoom + vy;

      // 화면 안에 (조금이라도) 보이면 글로우 안 함 — 노드 박스가 뷰포트와 겹치는지로 판정.
      const nx = node.position.x * zoom + vx;
      const ny = node.position.y * zoom + vy;
      const nw = nodeW * zoom;
      const nh = nodeH * zoom;
      const visible = nx < width && nx + nw > 0 && ny < height && ny + nh > 0;
      if (visible) continue; // 화면에 보이는 노드는 글로우 대상 아님

      // 화면 밖 — 어느 변 너머인지 판정(가장 많이 벗어난 축). 그 변에 글로우를 붙인다.
      const overL = -cx; // 왼쪽으로 벗어난 정도
      const overR = cx - width;
      const overT = -cy;
      const overB = cy - height;
      const maxOver = Math.max(overL, overR, overT, overB);
      let side: Side;
      let along: number;
      if (maxOver === overL) { side = 'left'; along = Math.max(0, Math.min(height, cy)); }
      else if (maxOver === overR) { side = 'right'; along = Math.max(0, Math.min(height, cy)); }
      else if (maxOver === overT) { side = 'top'; along = Math.max(0, Math.min(width, cx)); }
      else { side = 'bottom'; along = Math.max(0, Math.min(width, cx)); }
      raw.push({ side, along, sig });
    }

    // 근접 글로우 병합 — 같은 변 + along 근처(±MERGE)면 가장 강한 신호 1개로.
    const merged: GlowDot[] = [];
    for (const d of raw) {
      const near = merged.find((m) => m.side === d.side && Math.abs(m.along - d.along) < MERGE);
      if (!near) {
        merged.push({ ...d });
      } else if (SIGNAL_RANK[d.sig] < SIGNAL_RANK[near.sig]) {
        near.sig = d.sig; // 더 강한 신호로 대표색 교체
      }
    }
    return merged;
  }, [nodes, riskMap, vx, vy, zoom, width, height]);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      {dots.map((d, i) => {
        const rgb = SIGNAL_RGB[d.sig];
        const horizontal = d.side === 'top' || d.side === 'bottom';
        // 변을 따라 길고(SPREAD) 안쪽으로 얕게(DEPTH) 퍼지는 타원형 bloom — gradient 좌표를
        // 가장자리에 두어 빛이 안쪽으로만 스며들고 바깥은 화면 밖으로 잘린다.
        // ellipse 반경: 변 따라 SPREAD, 안쪽 DEPTH. 0%에서 진하게 시작해 부드럽게 사라짐.
        const box: React.CSSProperties = horizontal
          ? {
              left: d.along - SPREAD,
              width: SPREAD * 2,
              height: DEPTH,
              [d.side]: 0,
            }
          : {
              top: d.along - SPREAD,
              height: SPREAD * 2,
              width: DEPTH,
              [d.side]: 0,
            };
        // gradient 중심을 가장자리 변에 고정 → 안쪽으로만 번지는 비대칭 bloom.
        const at = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }[d.side];
        const radius = horizontal ? `${SPREAD}px ${DEPTH}px` : `${DEPTH}px ${SPREAD}px`;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              ...box,
              background: `radial-gradient(${radius} at ${at}, rgba(${rgb},0.50) 0%, rgba(${rgb},0.18) 35%, transparent 72%)`,
              transition: 'opacity var(--transition-base)',
            }}
          />
        );
      })}
    </div>
  );
}
