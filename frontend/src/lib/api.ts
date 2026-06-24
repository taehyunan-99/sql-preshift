// SchemaGraph JSON 계약 (ARCHITECTURE §5)
export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface ColumnDef {
  name: string;
  type: string;
  pk: boolean;
  fk: string | null; // 참조 테이블명 또는 null
  nullable: boolean;
  diff: DiffStatus;
  change?: { from: string; to: string }; // modified일 때만
  // 무결성 진단(backend가 채움, 전부 optional). estimated 라벨로 표기.
  implicitFkHint?: string; // 추정 참조 테이블 id (naming+type 휴리스틱)
  highNullRatio?: number; // pg_stats null_frac (0~1), near-saturation일 때만
  brokenReferential?: boolean; // FK 값이 부모 PK에 없는 고아 값 존재(row-scan)
  softDeletedParentRef?: boolean; // 부모 soft-delete — 논리적 broken, 물리 행 존재(informational)
}

export interface NodeDef {
  id: string;
  table: string;
  diff: DiffStatus;
  columns: ColumnDef[];
  isOrphan?: boolean; // FK in/out 둘 다 없는 고립 테이블
}

export interface EdgeDef {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  diff: DiffStatus;
  isEstimated?: boolean; // 암묵 FK 추정 엣지(dotted 렌더)
  estimatedConfidence?: 'high' | 'medium'; // 추정 신뢰도(엣지 톤 차등)
}

export interface SchemaGraph {
  nodes: NodeDef[];
  edges: EdgeDef[];
}

export interface SchemaDiff {
  before: SchemaGraph;
  after: SchemaGraph;
  // 누적 dry-run: 원본 실DB 대비 "스택 전체" 적용 결과. Unified뷰가 이걸 쓴다(없으면 after).
  cumulativeAfter?: SchemaGraph;
}

export interface RiskItem {
  level: 'critical' | 'warning' | 'info';
  rule: string;
  message: string; // 영어 (기본)
  messageKo?: string; // 한국어 (토글용)
  tables: string[]; // 이 위험이 영향을 주는 테이블명 — ERD 노드 강조용
  llmNote?: string;
  llmNoteKo?: string;
}

export interface AnalyzeResponse {
  mode: 'nl' | 'sql';
  detectedConfidence: number;
  sql: string;
  explanation: string; // 영어 설명(기본)
  explanationKo?: string; // 한국어 설명(UI 토글용)
  valid: boolean;
  violations: string[];
  schemaDiff: SchemaDiff;
  dataSim: {
    affectedRows: number;
    estimatedRows: number;
    // 제약 위반 사전 점검(ADD/SET NOT NULL): null=비대상, 0=안전, N>0=위반 행수
    constraintViolations?: number | null;
    constraintHint?: string | null;
    constraintHintKo?: string | null;
  } | null;
  risks: RiskItem[];
  downScript: string;
  token: string;
}

export interface ApplyResponse {
  auditId: string;
  appliedAt: string;
  sql: string;
}

export interface AuditEntry {
  id: string;
  sql: string;
  appliedAt: string;
  rolledBack: boolean;
}

export interface RollbackResponse {
  auditId: string;
  rolledBackAt: string;
}

export interface AnalyzeRequest {
  input: string;
  mode?: 'auto' | 'nl' | 'sql';
  priorSqls?: string[]; // 누적 dry-run baseline (직전까지 쌓은 SQL, 순서대로)
}

export interface ApplyAllResponse {
  auditIds: string[];
  appliedAt: string;
  count: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function analyzeInput(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `analyze failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchSchemaGraph(): Promise<SchemaGraph> {
  const res = await fetch(`${API_BASE}/api/schema/graph`);
  if (!res.ok) throw new Error(`schema graph fetch failed: ${res.status}`);
  return res.json();
}

export async function applySQL(token: string): Promise<ApplyResponse> {
  const res = await fetch(`${API_BASE}/api/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`apply failed: ${res.status}`);
  return res.json();
}

export async function applyAll(sqls: string[], confirmCritical = false): Promise<ApplyAllResponse> {
  const res = await fetch(`${API_BASE}/api/apply-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqls, confirmCritical }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `apply-all failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  const res = await fetch(`${API_BASE}/api/audit`);
  if (!res.ok) throw new Error(`audit fetch failed: ${res.status}`);
  return res.json();
}

export async function rollbackAudit(id: string): Promise<RollbackResponse> {
  const res = await fetch(`${API_BASE}/api/audit/${id}/rollback`, { method: 'POST' });
  if (!res.ok) throw new Error(`rollback failed: ${res.status}`);
  return res.json();
}

/* ─── 런타임 DB 연결 ──────────────────────────────────────────────── */

export interface ConnectionRequest {
  host: string;
  port: number;
  user: string;
  password: string;
  dbname: string;
}

export interface ConnectionStatus {
  connected: boolean;
  host: string | null;
  port: number | null;
  dbname: string | null;
  epoch: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  warnings: string[];
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/api/connection/status`);
  if (!res.ok) throw new Error(`connection status failed: ${res.status}`);
  return res.json();
}

export async function testConnection(req: ConnectionRequest): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE}/api/connection/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`connection test failed: ${res.status}`);
  return res.json();
}

export async function connectDatabase(req: ConnectionRequest): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/api/connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `connect failed: ${res.status}`);
  }
  return res.json();
}

// 샘플 시드 종류 — ecommerce(9테이블) / erp(92테이블). 로비 카드에서 선택.
export type SampleKind = 'ecommerce' | 'erp';

export async function disconnectDatabase(): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/api/connection`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`disconnect failed: ${res.status}`);
  return res.json();
}

export async function connectSampleDatabase(kind: SampleKind = 'ecommerce'): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/api/connection/sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `sample connect failed: ${res.status}`);
  }
  return res.json();
}
