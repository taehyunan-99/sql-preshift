'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePipelineStore } from '../../store/pipeline';
import { getLlmStatus, setLlmConfig, type LlmStatus } from '../../lib/api';

// TopBar의 모델 설정 진입점 + 모달. 자연어(NL→SQL)에 쓰는 chat 모델을 고른다.
// 기본 모델을 강제하지 않으므로(미선택=NL 비활성), 사용자가 설치된 모델 중 하나를
// 고르거나 태그를 직접 입력해 저장한다. 임베딩 모델(bge-m3)은 RAG 일관성상 고정이라 비노출.
export default function ModelSettings() {
  const language = usePipelineStore((s) => s.language);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [draft, setDraft] = useState(''); // 선택/입력 중인 모델 태그
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달 열 때마다 최신 상태 로드 — 그 사이 ollama pull로 설치 목록이 바뀌었을 수 있다.
  const refresh = () => {
    getLlmStatus()
      .then((s) => {
        setStatus(s);
        setDraft(s.chatModel);
      })
      .catch(() => setStatus(null));
  };
  useEffect(() => {
    if (open) {
      setError(null);
      refresh();
    }
  }, [open]);

  const ko = language === 'ko';
  // TopBar 배지 — 미선택이면 점등 안 함, 선택+가용이면 success.
  const ready = status?.ready ?? false;

  const onSave = async () => {
    const tag = draft.trim();
    if (!tag) return;
    setSaving(true);
    setError(null);
    try {
      await setLlmConfig(tag);
      refresh();
    } catch {
      setError(ko ? '저장에 실패했습니다.' : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const installed = status?.available ?? [];
  const selectedInstalled = draft.trim() !== '' && installed.includes(draft.trim());

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
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <div>
                <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0 }}>
                  {ko ? '자연어 모델' : 'Natural-language model'}
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                  {ko
                    ? '자연어를 SQL로 변환할 때 사용하는 모델입니다. SQL 직접 입력에는 필요하지 않습니다.'
                    : 'The model used to turn natural language into SQL. Not needed for direct SQL input.'}
                </p>
              </div>

              {/* Ollama 미도달 안내 */}
              {status && !status.reachable && (
                <div style={infoBoxStyle}>
                  {ko
                    ? 'Ollama가 감지되지 않습니다. ollama.com에서 설치하고 실행하세요.'
                    : 'Ollama not detected. Install it from ollama.com and start it.'}
                </div>
              )}

              {/* 설치된 모델 선택 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>{ko ? '설치된 모델' : 'Installed models'}</span>
                <select
                  value={selectedInstalled ? draft.trim() : ''}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!status?.reachable || installed.length === 0}
                  style={fieldStyle}
                >
                  <option value="">{ko ? '모델 선택' : 'Select a model'}</option>
                  {installed.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              {/* 직접 입력 — 설치 목록에 없는 태그를 받고 싶을 때 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>{ko ? '또는 태그 직접 입력' : 'Or enter a tag directly'}</span>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="qwen3:4b"
                  spellCheck={false}
                  style={fieldStyle}
                />
              </label>

              {/* 선택한 태그가 미설치면 pull 안내(다운로드 UI는 추후) */}
              {status?.reachable && draft.trim() !== '' && !installed.includes(draft.trim()) && (
                <div style={infoBoxStyle}>
                  {ko ? '이 모델은 아직 설치되지 않았습니다. 터미널에서 받으세요:' : 'This model is not installed yet. Pull it from a terminal:'}
                  <code style={codeStyle}>ollama pull {draft.trim()}</code>
                </div>
              )}

              {error && (
                <div style={{ ...infoBoxStyle, color: 'var(--color-error)', borderColor: 'var(--color-error-border)' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <button type="button" onClick={() => setOpen(false)} style={ghostBtnStyle}>
                  {ko ? '닫기' : 'Close'}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || draft.trim() === ''}
                  style={{ ...primaryBtnStyle, opacity: saving || draft.trim() === '' ? 0.5 : 1 }}
                >
                  {ko ? '저장' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  fontWeight: 600,
};

const fieldStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const infoBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-subtle)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  background: 'var(--bg-input)',
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-accent-border)',
  background: 'var(--color-accent)',
  color: 'var(--text-inverse)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 700,
  cursor: 'pointer',
};
