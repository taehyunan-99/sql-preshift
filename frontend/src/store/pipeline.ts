'use client';

import { create } from 'zustand';
import type { SchemaDiff } from '../lib/api';

export type PipelineStage = 'idle' | 'analyzing' | 'preview' | 'applying' | 'applied';

// UI 표시 언어 — 영어가 default(source-of-truth), 한국어는 토글 시 표시되는 보조 레이어.
export type Language = 'en' | 'ko';

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

export interface AnalyzeResult {
  mode: 'nl' | 'sql';
  detectedConfidence: number;
  sql: string;
  explanation: string;
  explanationKo?: string;
  schemaDiff: SchemaDiff;
  dataSim: {
    affectedRows: number;
    estimatedRows: number;
    constraintViolations?: number | null;
    constraintHint?: string | null;
    constraintHintKo?: string | null;
  } | null;
  risks: RiskItem[];
  downScript: string;
  token: string;
  hasCritical: boolean;
}

interface PipelineState {
  stage: PipelineStage;
  analyzeResult: AnalyzeResult | null;
  auditOpen: boolean;

  /* 전역 UI 표시 언어 — TopBar 토글이 제어. reset에 미포함(언어는 세션 내내 유지). */
  language: Language;

  /* 입력 상태 */
  inputText: string;
  isAnalyzing: boolean;
  analyzeError: string | null;

  /* 누적 dry-run 스택 — append-only, Undo는 끝에서만 pop. 매 analyze에 priorSqls로 동봉. */
  dryRunStack: string[];
  /* dryRunStack과 1:1 대응하는 분석 결과 캐시 — Undo 시 서버·LLM 재호출 없이 즉시 복원. */
  resultCache: AnalyzeResult[];

  /* 적용 완료 토스트 — applyAll 성공 시 적용 건수(N). 0/null=숨김. C-2 클라이맥스 연출. */
  appliedToast: number | null;
  setAppliedToast: (count: number | null) => void;

  /* 방금 Apply한 변경들의 audit ID(적용 순서). Applied 바의 Rollback이 역순 롤백에 사용. */
  lastAppliedAuditIds: string[];
  setLastAppliedAuditIds: (ids: string[]) => void;

  /* Apply All 직전 스택 백업 — Rollback("Apply 직전 상태로")이 프리뷰를 복원하는 데 쓴다.
     applyAll은 적용 후 dryRunStack을 비우므로, 비우기 전 스냅샷을 여기 보관한다. */
  appliedStackBackup: string[];
  appliedCacheBackup: AnalyzeResult[];

  /* 런타임 DB 연결 상태 — 온보딩 게이트가 사용. epoch는 DB 교체 순번. */
  connected: boolean;
  connectedHost: string | null;
  connectedDbname: string | null;
  connectionEpoch: number;

  /* 액션 */
  setStage: (stage: PipelineStage) => void;
  setAnalyzeResult: (result: AnalyzeResult) => void;
  reset: () => void;
  openAudit: () => void;
  closeAudit: () => void;
  setLanguage: (lang: Language) => void;

  setInputText: (text: string) => void;
  setAnalyzing: (v: boolean) => void;
  setAnalyzeError: (err: string | null) => void;

  pushDryRun: (sql: string, result: AnalyzeResult) => void;
  popDryRun: () => void;
  clearDryRun: () => void;

  /* Apply All 직전 호출 — 현 스택을 백업하고 비운다(applied 진입 준비). */
  prepareApply: () => void;
  /* Applied 바 Rollback — DB 롤백은 호출부에서 끝낸 뒤, 프리뷰 스택을 백업에서 복원하고
     stage를 'preview'로 되돌린다. 사용자는 "Apply 직전" 상태에서 다시 검토·재적용할 수 있다. */
  rollbackApplied: () => void;

  setConnection: (status: {
    connected: boolean;
    host: string | null;
    dbname: string | null;
    epoch: number;
  }) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  stage: 'idle',
  analyzeResult: null,
  auditOpen: false,
  language: 'en',

  inputText: '',
  isAnalyzing: false,
  analyzeError: null,
  dryRunStack: [],
  resultCache: [],
  appliedToast: null,
  lastAppliedAuditIds: [],
  appliedStackBackup: [],
  appliedCacheBackup: [],

  connected: false,
  connectedHost: null,
  connectedDbname: null,
  connectionEpoch: 0,

  setStage: (stage) => set({ stage }),
  setAnalyzeResult: (result) =>
    set({
      analyzeResult: result,
      stage: 'preview',
      isAnalyzing: false,
      analyzeError: null,
    }),
  reset: () =>
    set({
      stage: 'idle',
      analyzeResult: null,
      analyzeError: null,
      isAnalyzing: false,
      dryRunStack: [],
      resultCache: [],
      appliedToast: null,
      lastAppliedAuditIds: [],
      appliedStackBackup: [],
      appliedCacheBackup: [],
    }),
  openAudit: () => set({ auditOpen: true }),
  closeAudit: () => set({ auditOpen: false }),
  setLanguage: (language) => set({ language }),

  setAppliedToast: (appliedToast) => set({ appliedToast }),
  setLastAppliedAuditIds: (lastAppliedAuditIds) => set({ lastAppliedAuditIds }),

  setInputText: (text) => set({ inputText: text }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalyzeError: (err) => set({ analyzeError: err }),

  pushDryRun: (sql, result) =>
    set((s) => ({
      dryRunStack: [...s.dryRunStack, sql],
      resultCache: [...s.resultCache, result],
    })),
  popDryRun: () =>
    set((s) => ({
      dryRunStack: s.dryRunStack.slice(0, -1),
      resultCache: s.resultCache.slice(0, -1),
    })),
  clearDryRun: () => set({ dryRunStack: [], resultCache: [] }),

  // Apply 직전: 현 스택을 백업하고 비운다(applied 화면은 빈 스택 전제).
  prepareApply: () =>
    set((s) => ({
      appliedStackBackup: s.dryRunStack,
      appliedCacheBackup: s.resultCache,
      dryRunStack: [],
      resultCache: [],
    })),

  // Rollback(DB 되돌림은 호출부 완료 후): 백업한 프리뷰를 복원하고 preview로 복귀.
  // analyzeResult를 마지막 캐시로 되돌려 ERD가 누적 diff를 다시 그린다. 백업은 소비 후 비움.
  rollbackApplied: () =>
    set((s) => {
      const cache = s.appliedCacheBackup;
      return {
        dryRunStack: s.appliedStackBackup,
        resultCache: cache,
        analyzeResult: cache.length > 0 ? cache[cache.length - 1] : s.analyzeResult,
        stage: 'preview' as PipelineStage,
        lastAppliedAuditIds: [],
        appliedToast: null,
        appliedStackBackup: [],
        appliedCacheBackup: [],
      };
    }),

  setConnection: (status) =>
    set((s) => {
      // DB가 바뀌면(epoch 증가) 이전 DB 기준 누적 스택·분석은 모두 무효 — 초기화.
      const dbChanged = status.epoch !== s.connectionEpoch;
      return {
        connected: status.connected,
        connectedHost: status.host,
        connectedDbname: status.dbname,
        connectionEpoch: status.epoch,
        ...(dbChanged
          ? {
              dryRunStack: [],
              resultCache: [],
              analyzeResult: null,
              analyzeError: null,
              lastAppliedAuditIds: [],
              appliedStackBackup: [],
              appliedCacheBackup: [],
              stage: 'idle' as PipelineStage,
            }
          : {}),
      };
    }),
}));
