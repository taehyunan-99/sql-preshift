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
  suggestion?: string; // golden path — "대신 이렇게 하라" 안전 대안 (영어)
  suggestionKo?: string; // 한국어 (토글용)
  sizeNote?: string; // size-aware — "Rewrites ~N rows (M)" 영향 규모 (영어)
  sizeNoteKo?: string; // 한국어 (토글용)
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

export interface RollbackBatchResponse {
  rolledBackAuditIds: string[];
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

// 설치형(Electron): preload가 주입한 동적 sidecar 포트를 최우선으로 쓴다.
// 웹/dev: 기존 env fallback 유지 — 한 코드로 두 환경 모두 동작.
const API_BASE =
  (typeof window !== 'undefined' && window.desktop?.apiBase) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

// FastAPI 에러 본문에서 사람이 읽을 메시지를 뽑는다.
// HTTPException(detail=str)이면 그 문자열, detail={...message...}(구조화)이면 message를 쓴다.
// 후자를 그대로 Error()에 넣으면 "[object Object]"가 되므로 반드시 언래핑.
function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

export async function analyzeInput(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body, `analyze failed: ${res.status}`));
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
    throw new Error(errorMessage(body, `apply-all failed: ${res.status}`));
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

// apply-all로 적용한 auditIds 전체를 단일 target TX로 일괄 롤백(all-or-nothing).
// 역순 처리는 백엔드가 담당하므로 적용 순서 그대로 넘긴다.
export async function rollbackAuditBatch(ids: string[]): Promise<RollbackBatchResponse> {
  const res = await fetch(`${API_BASE}/api/audit/rollback-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auditIds: ids }),
  });
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
  // 타임아웃 필수 — backend가 재색인 등으로 잠시 hang해도 fetch가 무한 대기하면
  // page가 status 응답을 못 받아 게이트도 메인도 안 그려진다(빈 화면). 5초 내 무응답이면
  // reject → 호출부(.catch)가 미연결로 간주해 온보딩 게이트를 띄운다.
  const res = await fetch(`${API_BASE}/api/connection/status`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`connection status failed: ${res.status}`);
  return res.json();
}

export interface LlmStatus {
  reachable: boolean;
  chatModel: string;
  chatReady: boolean;
  embedModel: string;
  embedReady: boolean;
  ready: boolean;
  available: string[]; // 설치된 모델 태그 — 설정 드롭다운 후보
}

export async function getLlmStatus(): Promise<LlmStatus> {
  // NL 게이팅 신호 — Ollama serve + 필수 모델 가용 여부. 짧은 타임아웃(3s):
  // 무응답이면 미가용으로 간주해 SQL-only 안내로 폴백(메인 화면을 막지 않음).
  const res = await fetch(`${API_BASE}/api/llm/status`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`llm status failed: ${res.status}`);
  return res.json();
}

export interface LlmConfig {
  chatModel: string;
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const res = await fetch(`${API_BASE}/api/llm/config`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`llm config failed: ${res.status}`);
  return res.json();
}

export async function setLlmConfig(chatModel: string): Promise<LlmConfig> {
  const res = await fetch(`${API_BASE}/api/llm/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatModel }),
  });
  if (!res.ok) throw new Error(`set llm config failed: ${res.status}`);
  return res.json();
}

/* ─── 인앱 모델 다운로드 ──────────────────────────────────────────────── */

// 큐레이션 카드 — 실측(4f) 기반. size = NL 총 다운로드량(chat + bge-m3 1.2GB).
// tag는 실제 pull 가능 태그(호스트 Ollama 실측 확인).
export interface CuratedModel {
  tier: 'Light' | 'Balanced' | 'Quality'; // tier·tag·용량은 한글 UI에서도 영어 유지(고유명/수치)
  tag: string;
  totalGb: number; // NL 총량(chat + 1.2GB embed)
  blurb: string; // 영어 한 줄 설명
  blurbKo: string; // 한국어 한 줄 설명(UI 토글)
}

export const CURATED_MODELS: CuratedModel[] = [
  {
    tier: 'Light',
    tag: 'qwen3:4b',
    totalGb: 3.7,
    blurb: 'Fastest. Good for short, direct questions on smaller schemas.',
    blurbKo: '가장 빠릅니다. 작은 스키마의 짧고 직접적인 질문에 적합합니다.',
  },
  {
    tier: 'Balanced',
    tag: 'gemma4:e2b',
    totalGb: 8.4,
    blurb: 'A strong middle ground. Accurate SQL at a comfortable speed.',
    blurbKo: '균형 잡힌 선택. 적당한 속도로 정확한 SQL을 만듭니다.',
  },
  {
    tier: 'Quality',
    tag: 'gemma4:latest',
    totalGb: 10.8,
    blurb: 'Most accurate on complex joins and large schemas. Needs more memory.',
    blurbKo: '복잡한 조인과 큰 스키마에 가장 정확합니다. 메모리를 더 씁니다.',
  },
];

// pull 진행 이벤트 — backend client.pull_models가 흘리는 dict와 1:1.
export interface PullProgress {
  model?: string; // 현재 받는 태그(chat 또는 bge-m3)
  step?: number; // 1-기반 현재 단계
  steps?: number; // 전체 단계 수(1=chat만, 2=chat+embed)
  status?: string; // pulling manifest / verifying / success 등
  total?: number; // 현재 레이어 총 바이트
  completed?: number; // 현재 레이어 받은 바이트
  error?: string; // 실패 사유(있으면 스트림 종료)
  done?: boolean; // 통합 완료
}

// chat 모델(+ 미설치 bge-m3)을 받는 SSE 스트림을 읽어 진행 콜백을 호출한다.
// POST라 EventSource를 못 써서 fetch + ReadableStream으로 직접 파싱한다.
// signal로 취소 가능(AbortController). 반환은 정상 완료(done) 여부.
export async function pullModel(
  chatModel: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/llm/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatModel }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`pull failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  // SSE 프레임은 빈 줄(\n\n)로 구분, 각 프레임의 "data: " 라인이 페이로드.
  for (;;) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? ''; // 마지막은 미완 프레임 — 다음 청크와 이어붙임
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let evt: PullProgress | null = null;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue; // JSON 파싱 실패는 부분 라인 — 다음 유효 프레임으로 회복.
      }
      onProgress(evt!);
      if (evt!.error) throw new Error(evt!.error); // 서버가 보고한 실패는 그대로 전파.
      if (evt!.done) done = true;
    }
  }
  return done;
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

// 샘플 종류 — erp(92테이블, 분리 컨테이너 런타임 시드) / pagila(공개 스키마). 로비 카드에서 선택.
export async function disconnectDatabase(): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/api/connection`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`disconnect failed: ${res.status}`);
  return res.json();
}
