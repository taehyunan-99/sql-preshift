'use client';

import { create } from 'zustand';
import type { SchemaDiff } from '../lib/api';

export type PipelineStage = 'idle' | 'analyzing' | 'preview' | 'applying' | 'applied';

export interface RiskItem {
  level: 'critical' | 'warning' | 'info';
  rule: string;
  message: string; // 영어 (기본)
  messageKo?: string; // 한국어 (토글용)
  tables: string[]; // 이 위험이 영향을 주는 테이블명 — ERD 노드 강조용
  llmNote?: string;
  llmNoteKo?: string;
}

export interface AnalyzeResult {
  mode: 'nl' | 'sql';
  detectedConfidence: number;
  sql: string;
  explanation: string;
  explanationKo?: string;
  schemaDiff: SchemaDiff;
  dataSim: { affectedRows: number; estimatedRows: number } | null;
  risks: RiskItem[];
  downScript: string;
  token: string;
  hasCritical: boolean;
}

interface PipelineState {
  stage: PipelineStage;
  analyzeResult: AnalyzeResult | null;
  auditOpen: boolean;

  /* 입력 상태 */
  inputText: string;
  isAnalyzing: boolean;
  analyzeError: string | null;

  /* 누적 dry-run 스택 — append-only, Undo는 끝에서만 pop. 매 analyze에 priorSqls로 동봉. */
  dryRunStack: string[];

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

  setInputText: (text: string) => void;
  setAnalyzing: (v: boolean) => void;
  setAnalyzeError: (err: string | null) => void;

  pushDryRun: (sql: string) => void;
  popDryRun: () => void;
  clearDryRun: () => void;

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

  inputText: '',
  isAnalyzing: false,
  analyzeError: null,
  dryRunStack: [],

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
    }),
  openAudit: () => set({ auditOpen: true }),
  closeAudit: () => set({ auditOpen: false }),

  setInputText: (text) => set({ inputText: text }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalyzeError: (err) => set({ analyzeError: err }),

  pushDryRun: (sql) => set((s) => ({ dryRunStack: [...s.dryRunStack, sql] })),
  popDryRun: () => set((s) => ({ dryRunStack: s.dryRunStack.slice(0, -1) })),
  clearDryRun: () => set({ dryRunStack: [] }),

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
              analyzeResult: null,
              analyzeError: null,
              stage: 'idle' as PipelineStage,
            }
          : {}),
      };
    }),
}));
