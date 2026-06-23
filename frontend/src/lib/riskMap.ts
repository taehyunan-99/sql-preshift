import type { RiskItem } from '../store/pipeline';

export type RiskLevel = 'critical' | 'warning'; // info 제외 (캔버스 강조 대상 아님)
export type RiskMap = Record<string, RiskLevel>; // key=테이블명

// risks → 테이블별 위험 레벨 맵. 백엔드가 채운 risk.tables를 직접 사용(메시지 파싱 아님).
// 같은 테이블 다중 위험이면 critical 우선. info·테이블 없는 위험은 누락(graceful).
export function buildRiskMap(risks: RiskItem[]): RiskMap {
  const map: RiskMap = {};
  for (const r of risks) {
    if (r.level === 'info') continue;
    for (const t of r.tables ?? []) {
      if (!t) continue;
      if (map[t] === 'critical') continue; // critical 덮어쓰기 금지
      map[t] = r.level;
    }
  }
  return map;
}
