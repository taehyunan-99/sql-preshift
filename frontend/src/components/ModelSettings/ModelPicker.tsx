'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getLlmStatus,
  pullModel,
  setLlmConfig,
  CURATED_MODELS,
  type LlmStatus,
  type PullProgress,
  type CuratedModel,
} from '../../lib/api';

// v1 디자인 — 추천 카드 3종 + 인라인 진행 막대(%+용량) + Advanced 직접입력.
// 모달(ModelSettings)과 첫 페이지 보조 카드(DatabaseConnect) 양쪽에서 재사용한다.
// pull은 backend SSE 중계(POST /api/llm/pull)를 fetch 스트림으로 읽어 진행률을 그린다.

// 한 다운로드의 진행 상태 — 어떤 태그를 누가 받는지 + 현재 진행 이벤트.
interface DlState {
  tag: string; // 사용자가 누른 chat 태그(카드/입력)
  progress: PullProgress | null; // 최신 SSE 이벤트
}

interface Props {
  // 모델이 선택/준비되면 부모에 알린다(첫 페이지에서 카드 상태 갱신용). optional.
  onReady?: (status: LlmStatus) => void;
  // 헤더(타이틀+설명)를 숨긴다 — 모달은 자체 헤더가 있으므로 카드에서만 노출.
  hideHeader?: boolean;
}

export default function ModelPicker({ onReady, hideHeader }: Props) {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [dl, setDl] = useState<DlState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advTag, setAdvTag] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const refresh = () => {
    getLlmStatus()
      .then((s) => {
        setStatus(s);
        onReady?.(s);
      })
      .catch(() => setStatus(null));
  };
  // 마운트 시 1회 + 언마운트 시 진행 중 pull 중단.
  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installed = status?.available ?? [];
  const reachable = status?.reachable ?? false;
  const selected = status?.chatModel ?? '';

  // chat 태그를 받는다 — 완료되면 그 모델을 선택(set config)하고 상태 갱신.
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
        await setLlmConfig(trimmed); // 받은 모델을 NL 모델로 선택
        refresh();
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Download failed.');
      }
    } finally {
      setDl(null);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  // 이미 설치된 모델을 클릭 선택(다운로드 없이 chat 모델만 교체).
  const selectInstalled = async (tag: string) => {
    if (dl) return;
    setError(null);
    try {
      await setLlmConfig(tag);
      refresh();
    } catch {
      setError('Failed to select model.');
    }
  };

  return (
    <div className="mp-wrap">
      {!hideHeader && (
        <div className="mp-head">
          <div className="mp-title">Language model</div>
          <div className="mp-sub">
            Pick one model for natural-language to SQL. Each download includes the shared embedding model automatically.
          </div>
        </div>
      )}

      {status && !reachable && (
        <div className="mp-info">Ollama not detected. Install it from ollama.com and start it, then reopen this.</div>
      )}

      <div className="mp-cards">
        {CURATED_MODELS.map((m) => (
          <ModelCard
            key={m.tag}
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
      </div>

      {error && <div className="mp-error">{error}</div>}

      <details className="mp-adv">
        <summary>Advanced . direct tag</summary>
        <div className="mp-adv-note">
          Pull any model by its Ollama tag. The shared embedding model is added automatically if missing.
        </div>
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
        {/* 직접입력 태그를 받는 중이면 그 진행을 입력 아래에 인라인 표시 */}
        {dl && !CURATED_MODELS.some((m) => m.tag === dl.tag) && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <ProgressBlock tag={dl.tag} progress={dl.progress} onCancel={cancel} />
          </div>
        )}
      </details>

      <div className="mp-foot">
        <span className="mp-foot-dot" />
        Shared embedding model bge-m3 (1.2 GB) is included with every download.
      </div>

      <style jsx>{`
        .mp-wrap {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          font-family: var(--font-sans);
          color: var(--text-primary);
        }
        .mp-head {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .mp-title {
          font-size: var(--font-size-lg);
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .mp-sub {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          line-height: 1.45;
        }
        .mp-info {
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
        }
        .mp-error {
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          background: var(--color-error-bg);
          border: 1px solid var(--color-error-border);
          font-size: var(--font-size-sm);
          color: var(--color-error);
        }
        .mp-cards {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .mp-adv {
          border-top: 1px solid var(--border-subtle);
          padding-top: var(--space-4);
        }
        .mp-adv :global(summary) {
          list-style: none;
          cursor: pointer;
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--text-secondary);
          outline: none;
          user-select: none;
        }
        .mp-adv :global(summary)::-webkit-details-marker {
          display: none;
        }
        .mp-adv :global(summary):hover {
          color: var(--text-primary);
        }
        .mp-adv-note {
          font-size: var(--font-size-xs);
          color: var(--text-tertiary);
          margin: var(--space-2) 0 var(--space-3);
          line-height: 1.45;
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
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          outline: none;
        }
        .mp-input::placeholder {
          color: var(--text-tertiary);
        }
        .mp-input:focus {
          border-color: var(--color-accent-border);
        }
        .mp-input:disabled {
          opacity: 0.5;
        }
        .mp-btn {
          flex-shrink: 0;
          font-family: var(--font-sans);
          font-size: var(--font-size-sm);
          font-weight: 600;
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
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
        .mp-foot {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-size-xs);
          color: var(--text-tertiary);
          line-height: 1.45;
        }
        .mp-foot-dot {
          width: 7px;
          height: 7px;
          border-radius: var(--radius-pill);
          background: var(--color-success);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

// 단일 추천 카드 — 평상시(tier/tag/size/desc + Get|Installed|Selected), 다운로드 중엔 진행 막대로 전환.
function ModelCard({
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
  // 이 카드가 받는 중이면 progress가 아직 null이어도 즉시 막대로 전환(깜빡임 방지).
  if (isDownloading) {
    return (
      <div className="mp-card mp-card-dl">
        <ProgressBlock tag={model.tag} tier={model.tier} progress={progress} onCancel={onCancel} />
        <style jsx>{cardCss}</style>
      </div>
    );
  }
  return (
    <div className="mp-card">
      <div className="mp-card-main">
        <div className="mp-card-top">
          <span className="mp-tier">{model.tier}</span>
          <span className="mp-size">{model.totalGb} GB total</span>
          {isSelected && <span className="mp-badge">Selected</span>}
        </div>
        <span className="mp-tag">{model.tag}</span>
        <span className="mp-desc">{model.blurb}</span>
      </div>
      {installed ? (
        isSelected ? (
          <span className="mp-installed">Installed</span>
        ) : (
          <button className="mp-btn mp-btn-get" type="button" onClick={onSelect} disabled={disabled}>
            Use
          </button>
        )
      ) : (
        <button className="mp-btn mp-btn-get" type="button" onClick={onGet} disabled={disabled}>
          Get
        </button>
      )}
      <style jsx>{cardCss}</style>
    </div>
  );
}

// 진행 막대 — %+용량+서브라인(현재 받는 모델 단계). bytes는 현재 레이어 기준.
function ProgressBlock({
  tag,
  tier,
  progress,
  onCancel,
}: {
  tag: string;
  tier?: string;
  progress: PullProgress | null;
  onCancel: () => void;
}) {
  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const gb = (n: number) => (n / 1e9).toFixed(1);
  // 현재 받는 게 임베딩이면 그 사실을 서브라인에 — 아니면 일반 상태 텍스트.
  const isEmbed = (progress?.model ?? '').startsWith('bge-m3');
  const sub = isEmbed
    ? 'Downloading shared embedding model'
    : progress?.status === 'starting' || !progress?.status
      ? 'Starting download'
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
            Cancel
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

// 카드/진행 막대 공통 CSS — v1 디자인 그대로(클래스만 mp- 프리픽스).
const cardCss = `
  .mp-card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .mp-card:hover {
    border-color: var(--border-strong);
    background: var(--bg-tertiary);
  }
  .mp-card-dl {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
  }
  .mp-card-dl:hover {
    border-color: var(--color-accent-border);
    background: var(--color-accent-10);
  }
  .mp-card-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }
  .mp-card-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .mp-tier {
    font-size: var(--font-size-md);
    font-weight: 600;
  }
  .mp-size {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    padding: 1px var(--space-2);
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
    padding: 1px var(--space-2);
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
    line-height: 1.4;
  }
  .mp-btn {
    flex-shrink: 0;
    align-self: center;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
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
    gap: var(--space-1);
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
