'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import { useReducedMotion } from 'motion/react';
import { useEdgeConfig, useErdLabStore } from '../../store/erdLab';

// hover 강조는 transition 없이 즉시 적용한다(아래 style 주석 참고).
// dim 강도 — 0.18은 너무 어두워 "전체가 흐릿" 인상을 줬다. 은은한 후퇴로 완화.
const DIM_EDGE = 0.4;
const DIM_PILL = 0.45; // 텍스트라 라인보다 약간 높게(가독 유지)

// 엣지 diff 의미색 — 글로벌 룰. modified(amber) 추가, removed는 점선.
// raw hex로 고정 — stroke transition이 var(토큰)↔hex 간 보간을 못 해 색 변화가 통째로
// 무시되던 버그(특히 Safari) 때문. 토큰 hex 값과 동일(불변): success/error/warning/border-strong.
const DIFF_EDGE_COLOR: Record<string, string> = {
  added: '#5B9A6F',
  removed: '#C45B5B',
  modified: '#C4955A',
  unchanged: '#44515A',
};

// hover 강조용 lit 틴트 — resting 색과 동일 hue, +lightness/+saturation.
// resting hex는 불변. hover 시 연결선 색 자체가 밝아져 "빛이 들어온" 인상(halo 없음).
// unchanged(회색)도 hover 연결선이면 밝은 회색으로 빛난다 — diff 없는 관계도 강조돼야
// "hover한 테이블과 연결된 선"이 어느 화면(idle 포함)에서나 또렷이 보인다.
const DIFF_EDGE_COLOR_LIT: Record<string, string> = {
  added: '#70CC8D',
  removed: '#E87F7F',
  modified: '#E8B97E',
  unchanged: '#8A9AA5', // 어두운 회색(#44515A) → 밝은 회색으로 발광
};

// data로 흘려보내는 엣지 메타(useErdLayout가 채움). diff/cardinality 라벨 텍스트용.
interface RelationEdgeData {
  diff?: string;
  sourceCard?: string; // 예: 'N' (FK 쪽)
  targetCard?: string; // 예: '1' (PK 쪽)
  [key: string]: unknown;
}

// 1·N cardinality pill — 엣지 양 끝 근처에 배치(EdgeLabelRenderer = 캔버스 좌표계).
// hover 시 엣지 라인과 동일하게 반응: 연결=강조(살짝 확대), 비연결=dim.
function CardPill({
  x,
  y,
  text,
  color,
  dimmed,
  emphasized,
  reduceMotion,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  dimmed: boolean;
  emphasized: boolean;
  reduceMotion: boolean;
}) {
  const scale = emphasized && !reduceMotion ? 1.1 : 1; // 과확대 억제(1.15→1.1)
  return (
    <div
      style={{
        position: 'absolute',
        // translate(좌표)는 pan/zoom마다 바뀌지만 transition 대상은 transform이라
        // 좌표 변동도 같이 보간된다 → 단, ease-out·180ms라 hover scale과 자연 동조.
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
        transformOrigin: 'center',
        pointerEvents: 'none',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        padding: '2px 5px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-secondary)',
        color,
        // border shorthand는 애니 불가 → borderColor 분리(라인과 함께 색 크로스페이드).
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: color, // width 고정(reflow 없음), color만 보간
        // 강조는 box-shadow ring으로(reflow 없이 GPU 합성).
        boxShadow: emphasized ? `0 0 0 1px ${color}` : 'none',
        opacity: dimmed ? DIM_PILL : 1,
        // transition 없음 — 엣지 라인과 동일하게 즉시 적용. pill transform엔 pan/zoom 좌표가
        // 섞여 있어, transform transition이 WebKit에서 pill을 보간 중 합성 레이어로 만들어
        // 흐림/끊김을 유발했다. 보간 제거로 양쪽 브라우저에서 또렷하게 전환된다.
        transition: 'none',
      }}
    >
      {text}
    </div>
  );
}

export default function ErdRelationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  // 캔버스별 엣지 설정 — Context override 우선, 없으면 전역 store.
  const { edgeCurve, cardinality, edgeHover, edgeFlow } = useEdgeConfig();
  const hoveredNode = useErdLabStore((s) => s.hoveredNode);
  const reduceMotion = useReducedMotion() ?? false; // OS 동작 줄이기 시 hover 모션 정지

  const meta = (data ?? {}) as RelationEdgeData;
  const diff = meta.diff ?? 'unchanged';
  const color = DIFF_EDGE_COLOR[diff] ?? DIFF_EDGE_COLOR.unchanged;
  const litColor = DIFF_EDGE_COLOR_LIT[diff] ?? color; // hover 시 밝아질 색
  const isRemoved = diff === 'removed';

  // 곡선 분기: bezier(부드러운 S자) ↔ smoothstep(직각). 핸들 위치(Right→Left) 정합.
  // path만 사용(라벨은 양 끝 cardinality라 center labelX/Y 불필요).
  const [edgePath] = edgeCurve
    ? getBezierPath({
        sourceX,
        sourceY,
        sourcePosition: sourcePosition ?? Position.Right,
        targetX,
        targetY,
        targetPosition: targetPosition ?? Position.Left,
      })
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition: sourcePosition ?? Position.Right,
        targetX,
        targetY,
        targetPosition: targetPosition ?? Position.Left,
        borderRadius: 8,
      });

  // hover 강조: hover된 노드가 있을 때 — 연결 엣지는 강조(굵게/풀 opacity), 비연결은 dim.
  const connected = hoveredNode != null && (source === hoveredNode || target === hoveredNode);
  const dimmed = edgeHover && hoveredNode != null && !connected;
  const emphasized = edgeHover && connected;

  // removed=점선(흐르지 않음, 삭제 의미 보존). flow on이면 비-removed·비dim 엣지만 흐른다.
  const flowing = edgeFlow && !isRemoved && !dimmed;
  const dashed = isRemoved || flowing; // 흐르는 엣지만 점선, flow 멈춘 실선은 그대로

  const style: React.CSSProperties = {
    // hover 강조 = 연결선 색 자체가 밝아짐(같은 hue의 lit 틴트로 크로스페이드). halo/glow 없음.
    stroke: emphasized ? litColor : color,
    // 강조는 2.5(3은 과함) — dim 의존을 줄이고 대비로 강조해 깜빡임 체감↓.
    strokeWidth: emphasized ? 2.5 : 1.5,
    strokeDasharray: dashed ? '6 4' : undefined,
    opacity: dimmed ? DIM_EDGE : 1,
    // transition 없음 — hover 강조를 즉시 적용. CSS transition(stroke 색 보간)이 Safari/WebKit에서
    // 엣지 path를 보간 중 합성 레이어로 승격시켜 "흐림→선명" 깜빡임을 만들었다(실측·실기기 확정).
    // 보간을 없애면 양쪽 브라우저에서 흐림/끊김 없이 즉시 또렷하게 전환된다.
    transition: 'none',
    ...(flowing ? { animation: 'erd-edge-flow 0.7s linear infinite' } : null),
  };

  // cardinality pill 위치: source 끝(FK=N), target 끝(PK=1) 근처로 살짝 안쪽.
  const srcText = meta.sourceCard ?? 'N';
  const tgtText = meta.targetCard ?? '1';
  const srcPx = { x: sourceX + 14, y: sourceY };
  const tgtPx = { x: targetX - 14, y: targetY };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {cardinality && (
        <EdgeLabelRenderer>
          {/* pill도 라인과 동일하게 hover 반응(연결=lit색·확대, 비연결=dim) → 따로 놀지 않음 */}
          <CardPill x={srcPx.x} y={srcPx.y} text={srcText} color={emphasized ? litColor : color} dimmed={dimmed} emphasized={emphasized} reduceMotion={reduceMotion} />
          <CardPill x={tgtPx.x} y={tgtPx.y} text={tgtText} color={emphasized ? litColor : color} dimmed={dimmed} emphasized={emphasized} reduceMotion={reduceMotion} />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
