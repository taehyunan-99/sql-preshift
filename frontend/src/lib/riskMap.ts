import type { RiskItem } from '../store/pipeline';

export type RiskLevel = 'critical' | 'warning'; // info 제외 (캔버스 강조 대상 아님)
export type RiskMap = Record<string, RiskLevel>; // key=테이블명

// RiskItem엔 노드 id가 없으므로 rule+message 문자열에 테이블명이 포함되는지로 매칭.
// 긴 이름부터 매칭해 부분 문자열 오탐 최소화. RiskPanel과 buildRiskMap의 단일 출처.
export function matchTable(risk: RiskItem, tables: string[]): string | null {
  const haystack = `${risk.rule} ${risk.message}`.toLowerCase();
  const sorted = [...tables].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    if (t && haystack.includes(t.toLowerCase())) return t;
  }
  return null;
}

// risks → 테이블별 위험 레벨 맵. 같은 테이블 다중 위험이면 critical 우선.
// info·매칭 실패는 누락(graceful — 노드 경고 생략, 시트엔 표시 유지).
export function buildRiskMap(risks: RiskItem[], tables: string[]): RiskMap {
  const map: RiskMap = {};
  for (const r of risks) {
    if (r.level === 'info') continue;
    const t = matchTable(r, tables);
    if (!t) continue;
    if (map[t] === 'critical') continue; // critical 덮어쓰기 금지
    map[t] = r.level;
  }
  return map;
}
