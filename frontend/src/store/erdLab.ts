'use client';

import { create } from 'zustand';

// ERD 표현 설정 — 디자인 컨펌으로 확정된 값(고정 상수) + hover 전파 상태.
// 카드 강조는 Glow, 엣지는 곡선·cardinality·hover 켜고 flow는 끈다.
// 의미색(diff 글로벌 룰)은 불변 — 강조를 어느 레이어에 얹느냐만 정한다.
export type DiffEmphasis = 'glow' | 'solid' | 'subtle';

export interface EdgeConfig {
  edgeCurve: boolean; // true=bezier 곡선, false=smoothstep 직각
  cardinality: boolean; // 1·N pill 표시
  edgeHover: boolean; // 노드 hover 시 연결 엣지 강조 + 비연결 dim
  edgeFlow: boolean; // dash 흐름 애니
}

// 확정 디자인(상수). 추후 바꿀 일이 생기면 여기 한 곳만 고치면 된다.
const DIFF_EMPHASIS: DiffEmphasis = 'glow';
const EDGE_CONFIG: EdgeConfig = {
  edgeCurve: true,
  cardinality: true,
  edgeHover: true,
  edgeFlow: false,
};

export function useDiffEmphasis(): DiffEmphasis {
  return DIFF_EMPHASIS;
}

export function useEdgeConfig(): EdgeConfig {
  return EDGE_CONFIG;
}

// hover 전파만 동적 상태 — 노드 hover를 캡처해 ErdRelationEdge가 연결 엣지를 강조.
interface ErdHoverState {
  hoveredNode: string | null;
  setHoveredNode: (id: string | null) => void;
}

export const useErdLabStore = create<ErdHoverState>((set) => ({
  hoveredNode: null,
  setHoveredNode: (id) => set({ hoveredNode: id }),
}));
