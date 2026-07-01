// 무결성 진단 수집기 — SchemaGraph(노드/컬럼/엣지)에 흩어진 backend 진단 신호를
// 패널이 쓸 평탄한 항목 리스트로 모은다. 진단 "판정"은 전부 backend가 끝냈고(현업 근거
// 기반 false-positive 보정 완료), 여기선 수집·표시 문구만 담당한다.
//
// 5종(severity 순):
//  - broken      : FK 값이 부모 PK에 없는 고아 값(row-scan, 유일한 실제 데이터 무결성 신호) → warn
//  - softDelRef  : 부모가 soft-delete됨(논리 broken, 물리 행 존재)                          → info
//  - orphan      : FK in/out 둘 다 없는 고립 테이블(메타데이터 확정)                          → info
//  - implicitFk  : naming 휴리스틱 추정 FK(제약 없음 ≠ 관계 깨짐, 정보용)                     → info
//  - highNull    : near-saturation NULL FK(거의 안 쓰이는 vestigial 가능성, estimated)        → info
import type { SchemaGraph } from './api';
import type { Language } from '../store/pipeline';

export type DiagnosticKind = 'broken' | 'softDelRef' | 'orphan' | 'implicitFk' | 'highNull';
export type DiagnosticSeverity = 'warn' | 'info';

export interface DiagnosticItem {
  id: string; // 안정 key (kind:table.column 또는 kind:table)
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  table: string; // ERD 노드 강조용 테이블명(NodeDef.table) — Locate in ERD가 사용
  target: string; // 표시용 라벨: "table.column" 또는 "table"
  title: string; // 짧은 분류명(예: "Broken referential integrity")
  why: string; // 왜 신호가 떴는가(현업 근거 문구)
  fix: string; // 권장 조치
}

// kind별 메타 — 표시 문구는 한 곳에서 관리(ColumnRow title과 일관). 영어가 source-of-truth,
// *Ko는 전역 한/영 토글 시 표시되는 보조 레이어(collectDiagnostics가 language로 선택).
const KIND_META: Record<
  DiagnosticKind,
  { severity: DiagnosticSeverity; title: string; why: string; fix: string; titleKo: string; whyKo: string; fixKo: string }
> = {
  broken: {
    severity: 'warn',
    title: 'Broken referential integrity',
    why: 'Some rows reference a parent primary key that no longer exists (orphan values found by a row scan).',
    fix: 'Clean up the orphan rows, or add a foreign key with a sentinel/ON DELETE policy before enforcing it.',
    titleKo: '참조 무결성 깨짐',
    whyKo: '일부 행이 더 이상 존재하지 않는 부모 기본 키를 참조합니다(행 스캔으로 발견된 고아 값).',
    fixKo: '고아 행을 정리하거나, 제약을 강제하기 전에 sentinel/ON DELETE 정책과 함께 외래 키를 추가하세요.',
  },
  softDelRef: {
    severity: 'info',
    title: 'Soft-deleted parent reference',
    why: 'Rows reference a parent that is soft-deleted (deleted_at set). Logically broken but the row is physically intact.',
    fix: 'Confirm this is intended; queries that ignore soft-deleted rows may treat the child as orphaned.',
    titleKo: 'Soft-delete된 부모 참조',
    whyKo: 'soft-delete된 부모(deleted_at 설정됨)를 참조합니다. 논리적으로는 깨졌지만 물리적 행은 남아 있습니다.',
    fixKo: '의도된 상태인지 확인하세요. soft-delete된 행을 제외하는 쿼리는 이 자식을 고아로 취급할 수 있습니다.',
  },
  orphan: {
    severity: 'info',
    title: 'Isolated table',
    why: 'No foreign-key relationships in or out. May be a standalone lookup/config table, or a forgotten one.',
    fix: 'If it should relate to other tables, add the missing foreign keys.',
    titleKo: '고립된 테이블',
    whyKo: '들어오고 나가는 외래 키 관계가 전혀 없습니다. 독립 lookup/config 테이블이거나 잊힌 테이블일 수 있습니다.',
    fixKo: '다른 테이블과 관계가 있어야 한다면 누락된 외래 키를 추가하세요.',
  },
  implicitFk: {
    severity: 'info',
    title: 'Estimated foreign key',
    why: 'Column name suggests a relationship but no FK constraint exists (inferred from naming, not enforced).',
    fix: 'Add an explicit foreign key if the relationship is real; this only protects future inserts.',
    titleKo: '추정 외래 키',
    whyKo: '컬럼 이름이 관계를 시사하지만 FK 제약이 없습니다(이름 규칙으로 추정, 강제되지 않음).',
    fixKo: '실제 관계라면 명시적 외래 키를 추가하세요. 이는 이후 삽입만 보호합니다.',
  },
  highNull: {
    severity: 'info',
    title: 'Rarely populated foreign key',
    why: 'Almost always NULL (estimated from the last ANALYZE); possibly a vestigial column that is no longer used.',
    fix: 'Verify whether the column is still needed; consider dropping it if truly unused.',
    titleKo: '거의 채워지지 않는 외래 키',
    whyKo: '거의 항상 NULL입니다(직전 ANALYZE 기준 추정). 더 이상 쓰이지 않는 잔재 컬럼일 수 있습니다.',
    fixKo: '컬럼이 여전히 필요한지 확인하고, 정말 미사용이면 제거를 고려하세요.',
  },
};

// kind별 표시 순서(severity 우선, 같은 severity면 정의 순). 패널 정렬·요약 카운트에 사용.
export const DIAGNOSTIC_ORDER: DiagnosticKind[] = [
  'broken',
  'softDelRef',
  'orphan',
  'implicitFk',
  'highNull',
];

// 그래프에서 진단 5종을 평탄 수집. 진단은 "현재 스키마"(diff 없는 노드)를 대상으로 backend가
// 채우므로, added/removed 같은 diff 노드는 진단 비대상이라 자연히 신호가 없다(추가 가드 불필요).
export function collectDiagnostics(
  graph: SchemaGraph | undefined,
  language: Language = 'en',
): DiagnosticItem[] {
  if (!graph) return [];
  const items: DiagnosticItem[] = [];
  // 전역 언어로 표시 문구 선택(영어 source-of-truth, ko는 보조). 비어있으면 영어 폴백.
  const ko = language === 'ko';

  for (const node of graph.nodes) {
    // 테이블 수준: orphan
    if (node.isOrphan) {
      const m = KIND_META.orphan;
      items.push({
        id: `orphan:${node.id}`,
        kind: 'orphan',
        severity: m.severity,
        table: node.table,
        target: node.table,
        title: ko ? m.titleKo || m.title : m.title,
        why: ko ? m.whyKo || m.why : m.why,
        fix: ko ? m.fixKo || m.fix : m.fix,
      });
    }

    // 컬럼 수준: broken / softDelRef / implicitFk / highNull
    for (const col of node.columns) {
      const push = (kind: DiagnosticKind) => {
        const m = KIND_META[kind];
        items.push({
          id: `${kind}:${node.id}.${col.name}`,
          kind,
          severity: m.severity,
          table: node.table,
          target: `${node.table}.${col.name}`,
          title: ko ? m.titleKo || m.title : m.title,
          why: ko ? m.whyKo || m.why : m.why,
          fix: ko ? m.fixKo || m.fix : m.fix,
        });
      };
      // broken과 softDelRef는 상호배타(backend가 hard orphan 우선 판정). 둘 다 표시하되 broken 우선.
      if (col.brokenReferential) push('broken');
      else if (col.softDeletedParentRef) push('softDelRef');
      if (col.implicitFkHint) push('implicitFk');
      if (col.highNullRatio != null) push('highNull');
    }
  }

  // severity·정의 순 정렬 — warn이 위로.
  const rank = (k: DiagnosticKind) => DIAGNOSTIC_ORDER.indexOf(k);
  items.sort((a, b) => rank(a.kind) - rank(b.kind) || a.target.localeCompare(b.target));
  return items;
}

// kind별 개수 요약(패널 상단 카운트 칩용). 0인 kind도 키는 존재.
export function summarizeDiagnostics(items: DiagnosticItem[]): Record<DiagnosticKind, number> {
  const counts = {
    broken: 0,
    softDelRef: 0,
    orphan: 0,
    implicitFk: 0,
    highNull: 0,
  } as Record<DiagnosticKind, number>;
  for (const it of items) counts[it.kind] += 1;
  return counts;
}
