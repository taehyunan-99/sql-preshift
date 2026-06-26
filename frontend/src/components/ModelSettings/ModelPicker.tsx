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

// 모델 선택 본문 — 모달(ModelSettings)과 첫 페이지 진입 화면에서 공유한다.
// 추천 카드 3종 + None(모델 없이 진행) + Advanced 직접입력. pull은 backend SSE 중계
// (POST /api/llm/pull)를 fetch 스트림으로 읽어 인라인 진행 막대로 그린다.
//
// ⚠ 스타일은 전부 인라인이다. 이 코드베이스에서 styled-jsx(<style jsx>) 문자열 주입은
// 신뢰 불가(클래스 해시 미적용 → 버튼 UA 기본 배경이 흰 박스로 노출). motion/portal 요소도
// styled-jsx가 안 닿는다. 따라서 카드/칩/막대 전부 인라인 + tokens.css 전역 변수로 작성한다.
// UI 문자열만 한/영 전환 — 모델 tier 라벨·태그·용량은 한글에서도 영어 유지(고유명/수치).

interface DlState {
  tag: string;
  progress: PullProgress | null;
}

interface Props {
  // 모델 선택/준비가 바뀌면 부모에 최신 상태 전달(요약 카드 갱신용).
  onReady?: (status: LlmStatus) => void;
  // 모델/None 확정 후 화면을 닫고 싶을 때(부모가 닫기 제어).
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
    <div style={S.wrap}>
      {status && !reachable && (
        <div style={S.info}>
          {ko
            ? 'Ollama가 감지되지 않습니다. ollama.com에서 설치하고 실행한 뒤 다시 열어주세요.'
            : 'Ollama not detected. Install it from ollama.com and start it, then reopen this.'}
        </div>
      )}

      <div style={S.cards}>
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
        <NoneCard ko={ko} selected={noneSelected} disabled={!!dl} onClick={() => setConfirmNone(true)} />
      </div>

      {error && <div style={S.error}>{error}</div>}

      {/* Advanced — 직접 태그 입력. 클릭 토글. */}
      <div style={S.adv}>
        <AdvToggle ko={ko} onClick={() => setAdvOpen((v) => !v)} />
        {advOpen && (
          <div style={S.advBody}>
            <p style={S.advNote}>
              {ko
                ? 'Ollama 태그로 어떤 모델이든 받을 수 있습니다. 임베딩 모델은 없으면 자동으로 함께 받습니다.'
                : 'Pull any model by its Ollama tag. The shared embedding model is added automatically if missing.'}
            </p>
            <div style={S.advRow}>
              <input
                style={S.input}
                type="text"
                value={advTag}
                onChange={(e) => setAdvTag(e.target.value)}
                placeholder="e.g. llama3.1:8b"
                spellCheck={false}
                disabled={!reachable || !!dl}
                onFocus={(e) => Object.assign(e.currentTarget.style, S.inputFocus)}
                onBlur={(e) => Object.assign(e.currentTarget.style, S.inputBlur)}
              />
              <AccentButton
                label={ko ? '받기' : 'Get'}
                disabled={!reachable || !!dl || advTag.trim() === ''}
                onClick={() => startPull(advTag)}
              />
            </div>
            {advDownloading && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <ProgressBlock ko={ko} tag={dl!.tag} progress={dl!.progress} onCancel={cancel} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={S.foot}>
        <span style={S.footDot} />
        {ko
          ? '모델을 받으면 임베딩 모델 bge-m3 (1.2 GB)가 함께 포함됩니다.'
          : 'Shared embedding model bge-m3 (1.2 GB) is included with every download.'}
      </div>

      {/* None 확인 시트 — 정보성. 모델 없이 가능/불가 기능을 차분히 안내.
          portal로 body에(모달 overflow 회피) + 인라인 스타일. */}
      {confirmNone && mounted && createPortal(<NoneSheet ko={ko} onBack={() => setConfirmNone(false)} onConfirm={confirmNoModel} />, document.body)}
    </div>
  );
}

/* ─── None 카드 ──────────────────────────────────────────────── */

function NoneCard({ ko, selected, disabled, onClick }: { ko: boolean; selected: boolean; disabled: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const style: React.CSSProperties = {
    ...S.card,
    alignItems: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    ...(selected ? S.cardOn : hover && !disabled ? S.cardHover : null),
  };
  return (
    <button
      type="button"
      className="glass-trim"
      style={style}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={S.cardMain}>
        <div style={S.cardTop}>
          {/* tier 슬롯 — 언어 중립 라벨(model.tier와 동일 관례). 선택 시 accent 색. */}
          <span style={{ ...S.tier, ...(selected ? { color: 'var(--color-accent-hover)' } : null) }}>No model</span>
          {selected && <span style={S.badge}>{ko ? '선택됨' : 'Selected'}</span>}
        </div>
        <span style={S.desc}>
          {ko ? 'SQL 직접 입력만 사용합니다. 언제든 모델을 받을 수 있습니다.' : 'Use direct SQL input only. You can add a model anytime.'}
        </span>
      </div>
      <span style={S.noneAction}>{ko ? '계속' : 'Continue'}</span>
    </button>
  );
}

/* ─── Advanced 토글 / Accent 버튼 ──────────────────────────────────────────────── */

function AdvToggle({ ko, onClick }: { ko: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 500,
        color: hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'color 0.15s ease',
      }}
    >
      {ko ? '고급 . 태그 직접 입력' : 'Advanced . direct tag'}
    </button>
  );
}

function AccentButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        alignSelf: 'center',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        padding: 'var(--space-2) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'default' : 'pointer',
        background: hover && !disabled ? 'var(--color-accent-hover)' : 'var(--color-accent)',
        color: 'var(--text-inverse)',
        border: '1px solid var(--color-accent-border)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}

/* ─── None 확인 시트 ──────────────────────────────────────────────── */

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
            <div style={headStyle('var(--text-secondary)')}>{ko ? '사용 불가' : 'Not available'}</div>
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

/* ─── 모델 카드 ──────────────────────────────────────────────── */

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
  const [hover, setHover] = useState(false);

  if (isDownloading) {
    return (
      <div className="glass-trim" style={{ ...S.card, ...S.cardDl }}>
        <ProgressBlock ko={ko} tag={model.tag} tier={model.tier} progress={progress} onCancel={onCancel} />
      </div>
    );
  }

  const style: React.CSSProperties = {
    ...S.card,
    ...(isSelected ? S.cardOn : hover ? S.cardHover : null),
  };

  return (
    <div
      className="glass-trim"
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={S.cardMain}>
        <div style={S.cardTop}>
          {/* tier 라벨·태그·용량은 고유명/수치 — 한글에서도 영어 유지.
              선택 시 tier를 accent 색으로 — 카드 glow와 함께 '선택됨'을 또렷이. */}
          <span style={{ ...S.tier, ...(isSelected ? { color: 'var(--color-accent-hover)' } : null) }}>{model.tier}</span>
          <span style={S.size}>{model.totalGb} GB</span>
          {isSelected && <span style={S.badge}>{ko ? '선택됨' : 'Selected'}</span>}
        </div>
        <span style={S.tag}>{model.tag}</span>
        <span style={S.desc}>{ko ? model.blurbKo : model.blurb}</span>
      </div>
      {installed ? (
        isSelected ? (
          <span style={S.installed}>{ko ? '설치됨' : 'Installed'}</span>
        ) : (
          <GetButton label={ko ? '사용' : 'Use'} disabled={disabled} onClick={onSelect} />
        )
      ) : (
        <GetButton label={ko ? '받기' : 'Get'} disabled={disabled} onClick={onGet} />
      )}
    </div>
  );
}

function GetButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        alignSelf: 'center',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        padding: 'var(--space-2) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'default' : 'pointer',
        background: hover && !disabled ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: `1px solid ${hover && !disabled ? 'var(--text-tertiary)' : 'var(--border-strong)'}`,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}

/* ─── 진행 막대 ──────────────────────────────────────────────── */

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
    <div style={S.dlBody}>
      <div style={S.dlHead}>
        <div style={S.dlLeft}>
          <span style={S.tier}>{tier ?? tag}</span>
          <span style={S.tag}>{tag}</span>
        </div>
        <div style={S.dlLeft}>
          <span style={S.dlPct}>{total > 0 ? `${pct}%` : ''}</span>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {ko ? '취소' : 'Cancel'}
          </button>
        </div>
      </div>
      <div style={S.track}>
        <div style={{ ...S.fill, width: total > 0 ? `${pct}%` : '8%' }} />
      </div>
      <div style={S.dlMeta}>
        <span style={S.dlBytes}>{total > 0 ? `${gb(completed)} / ${gb(total)} GB` : ''}</span>
        <span style={S.dlSub}>
          <span style={S.dlDot} />
          {sub}
        </span>
      </div>
    </div>
  );
}

/* ─── 스타일 (전부 인라인 — styled-jsx 신뢰 불가) ──────────────────────── */

const S = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    // 섹션(info/cards/error/adv/foot) 간 간격 — 독립 블록이므로 space-6(섹션 표준).
    gap: 'var(--space-6)',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-primary)',
  },
  info: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-subtle)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  error: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-error)',
    lineHeight: 1.5,
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  // 카드 — 허브 카드(EntryCard)·DB 폼 셸과 동일한 유리 표면으로 통일:
  // bg-secondary + .glass-trim(인라인 적용 불가 → 컴포넌트 className으로 부여) + shadow-card.
  // 이전엔 bg-tertiary였는데 허브/DB 셸(bg-secondary+glass-trim)과 재질이 달라 빛이 떠 보였다.
  // border는 longhand로 — cardOn/cardHover/cardDl가 borderColor만 덮어쓰므로
  // shorthand `border`와 섞이면 React 경고(shorthand/non-shorthand 충돌).
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    padding: 'var(--space-5)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-md)',
    // 셸(bg-secondary) 안의 아이템 행 — AuditDrawer 이력 행과 같은 관례(bg-primary).
    // tertiary는 셸보다 밝아 떠 보이고, input은 입력 전용이라 너무 검다. primary는
    // 셸보다 살짝 어두워 자연스레 가라앉으면서도 새까맣지 않은 중간 톤(가이드 카드 면).
    background: 'var(--bg-primary)',
    boxShadow: 'var(--shadow-card)',
    textAlign: 'left',
    width: '100%',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  // hover — 허브 카드와 동일(테두리만 밝게 + 미세 1px ring). accent 글로우 없음.
  cardHover: {
    borderColor: 'var(--border-strong)',
    boxShadow: '0 0 0 1px var(--border-strong), var(--shadow-card)',
  },
  // 선택된 카드 — accent 테두리 + 은은한 teal glow + accent-10 배경(선택 명확히).
  // 직전에 glow를 너무 줄여 거의 안 보였다. 색광 번짐을 다시 살려 '선택됨'이 한눈에 보이게.
  cardOn: {
    borderColor: 'var(--color-accent-border)',
    background: 'var(--color-accent-10)',
    boxShadow: '0 0 0 1px var(--color-accent-border), 0 0 24px -6px var(--color-accent), var(--shadow-card)',
  },
  // 다운로드 중 — selected와 같은 언어, glow만 한 단계 더(진행 부각).
  cardDl: {
    borderColor: 'var(--color-accent-border)',
    background: 'var(--color-accent-10)',
    boxShadow: '0 0 0 1px var(--color-accent-border), 0 0 30px -5px var(--color-accent), var(--shadow-card)',
  },

  cardMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    minWidth: 0,
    flex: 1,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  tier: {
    fontSize: 'var(--font-size-md)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  // 용량 칩 — 흰 박스 금지. 배경 없이 미묘한 테두리 outline + 밝은 글자(가독).
  size: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
    padding: '2px var(--space-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-pill)',
    background: 'transparent',
  },
  // 선택 배지 — accent 톤(success-green이 아니라 선택=accent 아이덴티티로 통일).
  badge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    color: 'var(--color-accent-hover)',
    background: 'var(--color-accent-10)',
    border: '1px solid var(--color-accent-border)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-pill)',
  },
  // 태그(모노) — text-tertiary는 너무 어두워 안 보임. secondary로 가독 확보.
  tag: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-secondary)',
    letterSpacing: '-0.02em',
  },
  desc: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.55,
  },
  // 선택된 설치 모델의 우측 상태 — 선택=accent 아이덴티티로 통일(카드 glow와 한 색).
  installed: {
    flexShrink: 0,
    alignSelf: 'center',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-accent-hover)',
  },
  noneAction: {
    flexShrink: 0,
    alignSelf: 'center',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-accent)',
  },

  adv: {
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: 'var(--space-4)',
  },
  advBody: {},
  advNote: {
    fontSize: 'var(--font-size-xs)',
    // 본문성 안내라 가독 필요 — tertiary는 어두운 표면 위 대비 부족(secondary로).
    color: 'var(--text-secondary)',
    margin: 'var(--space-3) 0',
    lineHeight: 1.5,
  },
  advRow: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    // border longhand — inputFocus/Blur가 borderColor만 덮어쓰므로 shorthand와 안 섞이게.
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2) var(--space-3)',
    outline: 'none',
    transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
  },
  inputFocus: {
    borderColor: 'var(--color-accent-border)',
    // 포커스 글로우 — DatabaseConnect/InputPanel과 동일 언어(4px 링 + 30px 색광)로 통일.
    boxShadow: '0 0 0 4px var(--color-accent-10), 0 0 30px -4px var(--color-accent)',
  },
  inputBlur: {
    borderColor: 'var(--border)',
    boxShadow: 'none',
  },

  foot: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-tertiary)',
    lineHeight: 1.5,
  },
  footDot: {
    width: 7,
    height: 7,
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-success)',
    flexShrink: 0,
  },

  dlBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    width: '100%',
  },
  dlHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },
  dlLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    minWidth: 0,
  },
  dlPct: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-accent-hover)',
    fontVariantNumeric: 'tabular-nums',
  },
  track: {
    position: 'relative',
    height: 6,
    borderRadius: 'var(--radius-pill)',
    background: 'var(--bg-tertiary)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    inset: '0 auto 0 0',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-accent)',
    transition: 'width 0.3s ease',
  },
  dlMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },
  dlBytes: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  dlSub: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-tertiary)',
  },
  dlDot: {
    width: 7,
    height: 7,
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-accent)',
    flexShrink: 0,
  },
} satisfies Record<string, React.CSSProperties>;
