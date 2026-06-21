'use client';

import { create } from 'zustand';
import type { SchemaDiff } from '../lib/api';

export type PipelineStage = 'idle' | 'analyzing' | 'preview' | 'applying' | 'applied';
export type InputMode = 'auto' | 'nl' | 'sql';

export interface RiskItem {
  level: 'critical' | 'warning' | 'info';
  rule: string;
  message: string;
  llmNote?: string;
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
  inputMode: InputMode;
  isAnalyzing: boolean;
  analyzeError: string | null;

  /* 액션 */
  setStage: (stage: PipelineStage) => void;
  setAnalyzeResult: (result: AnalyzeResult) => void;
  reset: () => void;
  openAudit: () => void;
  closeAudit: () => void;

  setInputText: (text: string) => void;
  setInputMode: (mode: InputMode) => void;
  setAnalyzing: (v: boolean) => void;
  setAnalyzeError: (err: string | null) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  stage: 'idle',
  analyzeResult: null,
  auditOpen: false,

  inputText: '',
  inputMode: 'auto',
  isAnalyzing: false,
  analyzeError: null,

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
    }),
  openAudit: () => set({ auditOpen: true }),
  closeAudit: () => set({ auditOpen: false }),

  setInputText: (text) => set({ inputText: text }),
  setInputMode: (mode) => set({ inputMode: mode }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalyzeError: (err) => set({ analyzeError: err }),
}));
