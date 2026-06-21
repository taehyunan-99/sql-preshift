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
}

export interface NodeDef {
  id: string;
  table: string;
  diff: DiffStatus;
  columns: ColumnDef[];
}

export interface EdgeDef {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  diff: DiffStatus;
}

export interface SchemaGraph {
  nodes: NodeDef[];
  edges: EdgeDef[];
}

export interface SchemaDiff {
  before: SchemaGraph;
  after: SchemaGraph;
}

export interface RiskItem {
  level: 'critical' | 'warning' | 'info';
  rule: string;
  message: string;
  llmNote?: string;
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
  dataSim: { affectedRows: number; estimatedRows: number } | null;
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
