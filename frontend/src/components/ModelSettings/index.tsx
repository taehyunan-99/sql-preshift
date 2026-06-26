'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePipelineStore } from '../../store/pipeline';
import { getLlmStatus, type LlmStatus } from '../../lib/api';
import ModelPicker from './ModelPicker';

// TopBar의 모델 설정 진입점 + 모달. 자연어(NL→SQL)에 쓰는 chat 모델을 고르고 받는다.
// 내부 UI(추천 카드 + 인앱 다운로드 + Advanced)는 ModelPicker로 분리해 첫 페이지 카드와 공유한다.
export default function ModelSettings() {
  const language = usePipelineStore((s) => s.language);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // TopBar 배지 점등용 — ready면 success. 모달과 별개로 마운트 시/열 때 갱신.
  const [status, setStatus] = useState<LlmStatus | null>(null);
  useEffect(() => {
    getLlmStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const ko = language === 'ko';
  const ready = status?.ready ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={ko ? '자연어 모델 설정' : 'Natural-language model settings'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: ready ? 'var(--color-success)' : 'var(--text-tertiary)',
          }}
        />
        {ko ? '모델' : 'Model'}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--bg-scrim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 440,
                maxWidth: '90vw',
                maxHeight: '88vh',
                overflowY: 'auto',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
              }}
            >
              <ModelPicker onReady={setStatus} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
