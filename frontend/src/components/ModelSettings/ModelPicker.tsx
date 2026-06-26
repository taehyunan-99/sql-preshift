'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePipelineStore } from '../../store/pipeline';
import {
  getLlmStatus,
  pullModel,
  setLlmConfig,
  CURATED_MODELS,
  type LlmStatus,
  type PullProgress,
  type CuratedModel,
} from '../../lib/api';

// 모델 선택 본문 — 모달(ModelSettings)과 첫 페이지 진입 모달에서 공유한다.
// 추천 카드 3종 + None(모델 없이 진행) + Advanced 직접입력. pull은 backend SSE 중계
// (POST /api/llm/pull)를 fetch 스트림으로 읽어 인라인 진행 막대로 그린다.
// UI 문자열만 한/영 전환 — 모델 tier 라벨·태그·용량은 한글에서도 영어 유지(고유명/수치).

interface DlState {
  tag: string;
  progress: PullProgress | null;
}

interface Props {
  // 모델 선택/준비가 바뀌면 부모에 최신 상태 전달(요약 카드 갱신용).
  onReady?: (status: LlmStatus) => void;
  // 모델/None 확정 후 모달을 닫고 싶을 때(부모가 닫기 제어).
  onDone?: () => void;
}

export default function ModelPicker({ onReady, onDone }: Props) {
  const ko = usePipelineStore((s) => s.language) === 'ko';
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [dl, setDl] = useState<DlState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advTag, setAdvTag] = useState('');
  const [advOpen, setAdvOpen] = useState(false);
  // None 확인 시트 — 모델 없이 진행 시 비활성 기능 안내.
  const [confirmNone, setConfirmNone] = useState(false);
  // 시트는 portal로 document.body에 렌더 — 모달의 overflow가 fixed를 가두는 문제 회피.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = () => {
    getLlmStatus()
      .then((s) => {
        setStatus(s);
        onReady?.(s);
      })
      .catch(() => setStatus(null));
  };
  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installed = status?.available ?? [];
  const reachable = status?.reachable ?? false;
  const selected = status?.chatModel ?? '';
  const noneSelected = selected.trim() === '';

  const startPull = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || dl) return;
    setError(null);
    setDl({ tag: trimmed, progress: null });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const ok = await pullModel(trimmed, (p) => setDl({ tag: trimmed, progress: p }), ctrl.signal);
      if (ok) {
        await setLlmConfig(trimmed);
        refresh();
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : (ko ? '다운로드에 실패했습니다.' : 'Download failed.'));
    } finally {
      setDl(null);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  // 설치된 모델 선택(다운로드 없이 chat 모델 교체).
  const selectInstalled = async (tag: string) => {
    if (dl) return;
    setError(null);
    try {
      await setLlmConfig(tag);
      refresh();
    } catch {
      setError(ko ? '모델 선택에 실패했습니다.' : 'Failed to select model.');
    }
  };

  // None 확정 — chat 모델을 비워 NL 비활성. 안내 시트는 닫는다.
  const confirmNoModel = async () => {
    setError(null);
    try {
      await setLlmConfig('');
      refresh();
      setConfirmNone(false);
      onDone?.();
    } catch {
      setError(ko ? '설정 저장에 실패했습니다.' : 'Failed to save.');
    }
  };

  // 직접입력 진행은 카드가 아닌 입력 아래에 인라인으로.
  const advDownloading = dl && !CURATED_MODELS.some((m) => m.tag === dl.tag);

  return (
    <div className="mp-wrap">
      {status && !reachable && (
        <div className="mp-info">
          {ko
            ? 'Ollama가 감지되지 않습니다. ollama.com에서 설치하고 실행한 뒤 다시 열어주세요.'
            : 'Ollama not detected. Install it from ollama.com and start it, then reopen this.'}
        </div>
      )}

      <div className="mp-cards">
        {CURATED_MODELS.map((m) => (
          <ModelCard
            key={m.tag}
            ko={ko}
            model={m}
            installed={installed.includes(m.tag)}
            isSelected={selected === m.tag}
            isDownloading={dl?.tag === m.tag}
            progress={dl?.tag === m.tag ? dl.progress : null}
            disabled={!reachable || (!!dl && dl.tag !== m.tag)}
            onGet={() => startPull(m.tag)}
            onSelect={() => selectInstalled(m.tag)}
            onCancel={cancel}
          />
        ))}

        {/* None — 모델 없이 진행. 선택 시 비활성 기능 안내 시트. */}
        <button
          type="button"
          className={`mp-card mp-none${noneSelected ? ' mp-none-on' : ''}`}
          onClick={() => setConfirmNone(true)}
          disabled={!!dl}
        >
          <div className="mp-card-main">
            <div className="mp-card-top">
              <span className="mp-tier">{ko ? '모델 없이' : 'No model'}</span>
              {noneSelected && <span className="mp-badge">{ko ? '선택됨' : 'Selected'}</span>}
            </div>
            <span className="mp-desc">
              {ko ? 'SQL 직접 입력만 사용합니다. 언제든 모델을 받을 수 있습니다.' : 'Use direct SQL input only. You can add a model anytime.'}
            </span>
          </div>
          <span className="mp-none-action">{ko ? '계속' : 'Continue'}</span>
        </button>
      </div>

      {error && <div className="mp-error">{error}</div>}

      {/* Advanced — 직접 태그 입력. 클릭 토글(details 대신 제어 상태로 한/영 안정화). */}
      <div className="mp-adv">
        <button type="button" className="mp-adv-toggle" onClick={() => setAdvOpen((v) => !v)}>
          {ko ? '고급 . 태그 직접 입력' : 'Advanced . direct tag'}
        </button>
        {advOpen && (
          <div className="mp-adv-body">
            <p className="mp-adv-note">
              {ko
                ? 'Ollama 태그로 어떤 모델이든 받을 수 있습니다. 임베딩 모델은 없으면 자동으로 함께 받습니다.'
                : 'Pull any model by its Ollama tag. The shared embedding model is added automatically if missing.'}
            </p>
            <div className="mp-adv-row">
              <input
                className="mp-input"
                type="text"
                value={advTag}
                onChange={(e) => setAdvTag(e.target.value)}
                placeholder="e.g. llama3.1:8b"
                spellCheck={false}
                disabled={!reachable || !!dl}
              />
              <button
                className="mp-btn mp-btn-accent"
                type="button"
                onClick={() => startPull(advTag)}
                disabled={!reachable || !!dl || advTag.trim() === ''}
              >
                Get
              </button>
            </div>
            {advDownloading && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <ProgressBlock ko={ko} tag={dl!.tag} progress={dl!.progress} onCancel={cancel} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mp-foot">
        <span className="mp-foot-dot" />
        {ko
          ? '모델을 받으면 임베딩 모델 bge-m3 (1.2 GB)가 함께 포함됩니다.'
          : 'Shared embedding model bge-m3 (1.2 GB) is included with every download.'}
      </div>

      {/* None 확인 시트 — 정보성. 모델 없이 가능/불가 기능을 차분히 안내.
          portal로 body에(모달 overflow 회피) + 인라인 스타일(portal엔 styled-jsx 미적용). */}
      {confirmNone && mounted && createPortal(<NoneSheet ko={ko} onBack={() => setConfirmNone(false)} onConfirm={confirmNoModel} />, document.body)}

      <style jsx>{wrapCss}</style>
      <style jsx>{cardCss}</style>
    </div>
  );
}

// None 확인 시트 — portal 렌더라 styled-jsx가 안 닿아 인라인 스타일로 작성한다.
function NoneSheet({ ko, onBack, onConfirm }: { ko: boolean; onBack: () => void; onConfirm: () => void }) {
  const headStyle = (color: string): React.CSSProperties => ({
    fontSize: 'var(--font-size-xs)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 'var(--space-2)',
    color,
  });
  const listStyle = (muted: boolean): React.CSSProperties => ({
    margin: 0,
    paddingLeft: 'var(--space-4)',
    fontSize: 'var(--font-size-sm)',
    color: muted ? 'var(--text-tertiary)' : 'var(--text-secondary)',
    lineHeight: 1.7,
  });
  return (
    <div
      onClick={onBack}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-scrim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="glass-trim"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '100%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-modal), 0 0 30px -6px var(--color-accent)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
          {ko ? '모델 없이 진행할까요?' : 'Continue without a model?'}
        </div>
        <p style={{ margin: 'calc(-1 * var(--space-2)) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {ko ? '자연어 입력이 꺼진 상태로 유지됩니다.' : 'Natural-language input stays off.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <div style={{ flex: 1 }}>
            <div style={headStyle('var(--color-success)')}>{ko ? '계속 사용 가능' : 'Still works'}</div>
            <ul style={listStyle(false)}>
              <li>{ko ? 'SQL 직접 입력' : 'Direct SQL input'}</li>
              <li>{ko ? '스키마 diff . 위험 . 적용' : 'Schema diffs, risks, apply'}</li>
            </ul>
          </div>
          <div style={{ flex: 1 }}>
            <div style={headStyle('var(--text-tertiary)')}>{ko ? '사용 불가' : 'Not available'}</div>
            <ul style={listStyle(true)}>
              <li>{ko ? '자연어로 SQL 작성' : 'Plain-English to SQL'}</li>
            </ul>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {ko ? '뒤로' : 'Back'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: 'var(--text-inverse)',
              border: '1px solid var(--color-accent-border)',
              cursor: 'pointer',
            }}
          >
            {ko ? '계속' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  ko,
  model,
  installed,
  isSelected,
  isDownloading,
  progress,
  disabled,
  onGet,
  onSelect,
  onCancel,
}: {
  ko: boolean;
  model: CuratedModel;
  installed: boolean;
  isSelected: boolean;
  isDownloading: boolean;
  progress: PullProgress | null;
  disabled: boolean;
  onGet: () => void;
  onSelect: () => void;
  onCancel: () => void;
}) {
  if (isDownloading) {
    return (
      <div className="mp-card mp-card-dl">
        <ProgressBlock ko={ko} tag={model.tag} tier={model.tier} progress={progress} onCancel={onCancel} />
        <style jsx>{cardCss}</style>
      </div>
    );
  }
  return (
    <div className={`mp-card${isSelected ? ' mp-card-on' : ''}`}>
      <div className="mp-card-main">
        <div className="mp-card-top">
          {/* tier 라벨·태그·용량은 고유명/수치 — 한글에서도 영어 유지. */}
          <span className="mp-tier">{model.tier}</span>
          <span className="mp-size">{model.totalGb} GB total</span>
          {isSelected && <span className="mp-badge">{ko ? '선택됨' : 'Selected'}</span>}
        </div>
        <span className="mp-tag">{model.tag}</span>
        <span className="mp-desc">{ko ? model.blurbKo : model.blurb}</span>
      </div>
      {installed ? (
        isSelected ? (
          <span className="mp-installed">{ko ? '설치됨' : 'Installed'}</span>
        ) : (
          <button className="mp-btn mp-btn-get" type="button" onClick={onSelect} disabled={disabled}>
            {ko ? '사용' : 'Use'}
          </button>
        )
      ) : (
        <button className="mp-btn mp-btn-get" type="button" onClick={onGet} disabled={disabled}>
          {ko ? '받기' : 'Get'}
        </button>
      )}
      <style jsx>{cardCss}</style>
    </div>
  );
}

function ProgressBlock({
  ko,
  tag,
  tier,
  progress,
  onCancel,
}: {
  ko: boolean;
  tag: string;
  tier?: string;
  progress: PullProgress | null;
  onCancel: () => void;
}) {
  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const gb = (n: number) => (n / 1e9).toFixed(1);
  const isEmbed = (progress?.model ?? '').startsWith('bge-m3');
  const sub = isEmbed
    ? ko ? '임베딩 모델 받는 중' : 'Downloading shared embedding model'
    : progress?.status === 'starting' || !progress?.status
      ? ko ? '시작하는 중' : 'Starting download'
      : progress.status;

  return (
    <div className="mp-dl-body">
      <div className="mp-dl-head">
        <div className="mp-dl-left">
          <span className="mp-tier">{tier ?? tag}</span>
          <span className="mp-tag">{tag}</span>
        </div>
        <div className="mp-dl-left">
          <span className="mp-dl-pct">{total > 0 ? `${pct}%` : ''}</span>
          <button className="mp-cancel" type="button" onClick={onCancel}>
            {ko ? '취소' : 'Cancel'}
          </button>
        </div>
      </div>
      <div className="mp-track">
        <div className="mp-fill" style={{ width: total > 0 ? `${pct}%` : '8%' }} />
      </div>
      <div className="mp-dl-meta">
        <span className="mp-dl-bytes">{total > 0 ? `${gb(completed)} / ${gb(total)} GB` : ''}</span>
        <span className="mp-dl-sub">
          <span className="mp-dot" />
          {sub}
        </span>
      </div>
      <style jsx>{cardCss}</style>
    </div>
  );
}

// 래퍼 레벨 CSS — 간격 넉넉히(텍스트가 면에 붙지 않게), None 시트, Advanced.
const wrapCss = `
  .mp-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    font-family: var(--font-sans);
    color: var(--text-primary);
  }
  .mp-info {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .mp-error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    font-size: var(--font-size-sm);
    color: var(--color-error);
    line-height: 1.5;
  }
  .mp-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .mp-adv {
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--space-4);
  }
  .mp-adv-toggle {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--text-secondary);
    transition: color 0.15s ease;
  }
  .mp-adv-toggle:hover {
    color: var(--text-primary);
  }
  .mp-adv-note {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    margin: var(--space-3) 0;
    line-height: 1.5;
  }
  .mp-adv-row {
    display: flex;
    gap: var(--space-2);
  }
  .mp-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .mp-input::placeholder {
    color: var(--text-tertiary);
  }
  .mp-input:focus {
    border-color: var(--color-accent-border);
    box-shadow: 0 0 0 3px var(--color-accent-10);
  }
  .mp-input:disabled {
    opacity: 0.5;
  }
  .mp-foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    line-height: 1.5;
  }
  .mp-foot-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--color-success);
    flex-shrink: 0;
  }
`;

// 카드/진행 막대 CSS — 간격 넉넉, glow(선택/다운로드 시 teal halo).
const cardCss = `
  .mp-card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    text-align: left;
    width: 100%;
    font-family: var(--font-sans);
    transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }
  .mp-card:hover {
    border-color: var(--border-strong);
    background: var(--bg-tertiary);
  }
  /* 선택된 카드 — accent 테두리 + 은은한 teal glow(아이덴티티). */
  .mp-card-on {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
    box-shadow: 0 0 0 3px var(--color-accent-10), 0 0 24px -8px var(--color-accent);
  }
  .mp-card-on:hover {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
  }
  /* 다운로드 중 — 더 강한 glow로 진행을 부각. */
  .mp-card-dl {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
    box-shadow: 0 0 0 3px var(--color-accent-10), 0 0 30px -6px var(--color-accent);
  }
  .mp-card-dl:hover {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
  }
  .mp-none {
    cursor: pointer;
    align-items: center;
  }
  .mp-none:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .mp-none-on {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
    box-shadow: 0 0 0 3px var(--color-accent-10), 0 0 24px -8px var(--color-accent);
  }
  .mp-none-action {
    flex-shrink: 0;
    align-self: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-accent);
  }
  .mp-card-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    flex: 1;
  }
  .mp-card-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .mp-tier {
    font-size: var(--font-size-md);
    font-weight: 600;
  }
  .mp-size {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    padding: 2px var(--space-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    background: var(--bg-input);
  }
  .mp-badge {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-success);
    background: var(--color-success-bg);
    border: 1px solid var(--color-success-border);
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
  }
  .mp-tag {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    letter-spacing: -0.02em;
  }
  .mp-desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .mp-btn {
    flex-shrink: 0;
    align-self: center;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .mp-btn-get {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-strong);
  }
  .mp-btn-get:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--text-tertiary);
  }
  .mp-btn-accent {
    background: var(--color-accent);
    color: var(--text-inverse);
    border: 1px solid var(--color-accent-border);
  }
  .mp-btn-accent:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }
  .mp-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .mp-installed {
    flex-shrink: 0;
    align-self: center;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-success);
  }
  .mp-dl-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
  }
  .mp-dl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .mp-dl-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .mp-dl-pct {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-accent-hover);
    font-variant-numeric: tabular-nums;
  }
  .mp-cancel {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-sans);
  }
  .mp-cancel:hover {
    color: var(--text-secondary);
  }
  .mp-track {
    position: relative;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--bg-tertiary);
    overflow: hidden;
  }
  .mp-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    transition: width 0.3s ease;
  }
  .mp-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
    transform: translateX(-100%);
    animation: mp-shim 1.6s ease-in-out infinite;
  }
  @keyframes mp-shim {
    to {
      transform: translateX(220%);
    }
  }
  .mp-dl-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .mp-dl-bytes {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .mp-dl-sub {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
  .mp-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    flex-shrink: 0;
    animation: mp-pulse 1.4s ease-in-out infinite;
  }
  @keyframes mp-pulse {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
`;
