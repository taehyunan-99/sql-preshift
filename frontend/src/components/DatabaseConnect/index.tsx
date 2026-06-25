'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  connectDatabase,
  connectSampleDatabase,
  testConnection,
  type ConnectionStatus,
  type SampleKind,
} from '../../lib/api';
import { usePipelineStore } from '../../store/pipeline';
import LanguageToggle from '../LanguageToggle';
import AppBackdrop from '../AppBackdrop';

// 온보딩 전체화면 게이트 — target DB 미연결 시 메인 진입 전 노출.
// 2단계 로비: (1) 경로 선택 카드(Use Sample / Connect Your Own) → (2) 자기DB면 연결 폼.
// Sample은 카드 클릭 즉시 연결. onConnected로 부모(page)에 상태를 올려 메인(대화창)으로 진입.

interface Props {
  onConnected: (status: ConnectionStatus) => void;
  // 메인에서 교체 모달로 재사용할 때 닫기 버튼 노출. 최초 게이트에선 undefined.
  onCancel?: () => void;
}

// 로비(경로 선택) ↔ 폼(자기 DB 입력) 단계.
type Step = 'lobby' | 'form';

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

export default function DatabaseConnect({ onConnected, onCancel }: Props) {
  const language = usePipelineStore((s) => s.language);
  const ko = language === 'ko';
  // 로비에서 시작. 'Connect Your Own' 선택 시 'form'으로.
  const [step, setStep] = useState<Step>('lobby');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [dbname, setDbname] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tested, setTested] = useState(false);
  // 어느 샘플 카드가 로딩 중인지(두 샘플 중 눌린 쪽에만 'Loading…' 표시).
  const [loadingKind, setLoadingKind] = useState<SampleKind | null>(null);

  // 포커스 글로우용 — 현재 포커스된 입력 필드 키.
  const [focused, setFocused] = useState<string | null>(null);
  // Test Connection 진행 중 여부(shimmer 표시용).
  const [testing, setTesting] = useState(false);

  const req = () => ({ host, port: Number(port) || 5432, user, password, dbname });

  // 포커스 글로우 — 포커스된 입력에 accent border + 은은한 ring.
  const fieldStyle = (key: string): React.CSSProperties => {
    const on = focused === key;
    return {
      ...FIELD,
      borderColor: on ? 'var(--color-accent)' : 'var(--border)',
      boxShadow: on ? '0 0 0 3px var(--color-accent-20)' : 'none',
      transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
    };
  };
  const focusProps = (key: string) => ({
    onFocus: () => setFocused(key),
    onBlur: () => setFocused((f) => (f === key ? null : f)),
  });

  async function handleTest() {
    setBusy(true);
    setTesting(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await testConnection(req());
      if (res.success) {
        setTested(true);
        setWarnings(res.warnings);
      } else {
        setError(res.message);
        setTested(false);
      }
    } catch {
      setError(ko ? '연결 테스트에 실패했습니다. 백엔드가 실행 중인지 확인하세요.' : 'Connection test failed. Check that the backend is running.');
    } finally {
      setBusy(false);
      setTesting(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const status = await connectDatabase(req());
      onConnected(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ko ? '연결에 실패했습니다.' : 'Failed to connect.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSample(kind: SampleKind) {
    setBusy(true);
    setLoadingKind(kind);
    setError(null);
    try {
      const status = await connectSampleDatabase(kind);
      onConnected(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ko ? '샘플 데이터베이스 로드에 실패했습니다.' : 'Failed to load sample database.'));
    } finally {
      setBusy(false);
      setLoadingKind(null);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* 공통 배경 — 전 화면(연결/idle/작업중) 동일 후광. 연결 화면은 후광이 주역(lobby). */}
      <AppBackdrop stage="lobby" />

      {/* 언어 토글 — 시작화면엔 TopBar가 없으므로 우상단에 직접 배치(첫 화면부터 한/영 전환). */}
      <div style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 2 }}>
        <LanguageToggle />
      </div>

      {/* 브랜드 헤더 — 두 단계 공통(첫인상). */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: step === 'lobby' ? 920 : 440,
          maxWidth: '92vw',
          transition: 'width var(--transition-base)',
        }}
      >
        {/* 효과 1 — 진입 stagger fade-up: 타이틀→서브타이틀이 8px 아래에서 순차로 떠오름. */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0 }}
            style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}
          >
            SQLPreShift
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0.08 }}
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {ko
              ? '실제 PostgreSQL 데이터베이스에 대해 스키마 변경을 미리 확인하세요 — 배포 전에, 안전하게.'
              : 'Preview schema changes against a live PostgreSQL database — safely, before they ship.'}
          </motion.p>
        </div>

        {step === 'lobby' ? (
          // ── Step 1: 로비 — 경로 선택 카드 3장(샘플 2종 + 자기 DB) ──
          // 효과 1 — stagger의 세 번째 요소(카드 묶음)가 마지막으로 떠오름.
          <motion.div
            key="lobby"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0.16 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            {/* B+C 레이아웃 — 좌: 샘플 2장(compact 세로 묶음) / 우: 내 DB(강조). 각 카드 아이콘.
                "샘플 둘러보기 vs 내 DB 연결"의 성격 차이를 크기·accent로 시각화. */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'stretch' }}>
              {/* 좌측: 샘플 2장 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <LobbyCard
                  variant="sample"
                  compact
                  icon="partition"
                  title={ko ? 'Pagila 샘플' : 'Pagila Sample'}
                  desc={
                    ko
                      ? '실무 표준 DVD 대여 스키마(파티션·뷰·트리거·JSONB 포함). 실제 공개 데이터베이스에 그대로 연결합니다.'
                      : 'A real-world DVD rental schema with partitions, views, triggers, and JSONB. Connects to an actual public database as-is.'
                  }
                  disabled={busy}
                  busy={loadingKind === 'pagila'}
                  onClick={() => handleSample('pagila')}
                  ko={ko}
                />
                <LobbyCard
                  variant="sample"
                  compact
                  icon="grid"
                  title={ko ? 'ERP 샘플' : 'ERP Sample'}
                  desc={
                    ko
                      ? '무결성 문제가 내장된 현실적인 92테이블 ERP 스키마. 대규모 진단 탐색에 좋습니다.'
                      : 'A realistic 92-table ERP schema with built-in integrity issues. Best for exploring diagnostics at scale.'
                  }
                  disabled={busy}
                  busy={loadingKind === 'erp'}
                  onClick={() => handleSample('erp')}
                  ko={ko}
                />
              </div>
              {/* 우측: 내 DB 연결(강조) */}
              <div style={{ flex: 1.1, display: 'flex' }}>
                <LobbyCard
                  variant="own"
                  icon="database"
                  title={ko ? '내 DB 연결' : 'Connect Your Own'}
                  desc={
                    ko
                      ? 'SQLPreShift를 내 PostgreSQL 데이터베이스에 연결합니다. 읽기 전용 미리보기 — 승인 전까지 아무것도 적용되지 않습니다.'
                      : 'Point SQLPreShift at your PostgreSQL database. Read-only preview; nothing is applied until you approve.'
                  }
                  cta={ko ? '연결 설정' : 'Set up connection'}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setStep('form');
                  }}
                  ko={ko}
                />
              </div>
            </div>
            {/* 샘플 시드 실패 시 로비에도 에러 노출(폼에만 있던 배너 보강) */}
            {error && (
              <div
                style={{
                  padding: '8px 10px',
                  background: 'var(--color-error-bg)',
                  border: '1px solid var(--color-error-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-error)',
                }}
              >
                {error}
              </div>
            )}
          </motion.div>
        ) : (
          // ── Step 2: 자기 DB 연결 폼 ──
          // 효과 4 — step 전환: 폼이 살짝 옆에서 페이드인(로비↔폼 전환 연출).
          <motion.div
            key="form"
            className="glass-trim"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.32, ease: [0.34, 1.2, 0.64, 1] }}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-modal)',
              padding: 'var(--space-6)',
            }}
          >
            <button
              onClick={() => {
                setError(null);
                setWarnings([]);
                setStep('lobby');
              }}
              disabled={busy}
              style={{
                // Secondary 버튼 톤(중립) — Back은 주 행동 아님이라 accent 안 씀. radius-md.
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                transition: 'background var(--transition-base)',
              }}
            >
              {ko ? '선택으로 돌아가기' : 'Back to options'}
            </button>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div style={{ flex: 2 }}>
                <label style={LABEL}>Host</label>
                <input style={fieldStyle('host')} {...focusProps('host')} value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Port</label>
                <input style={fieldStyle('port')} {...focusProps('port')} value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <label style={LABEL}>Database</label>
              <input style={fieldStyle('dbname')} {...focusProps('dbname')} value={dbname} onChange={(e) => setDbname(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>User</label>
                <input style={fieldStyle('user')} {...focusProps('user')} value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Password</label>
                <input
                  style={fieldStyle('password')}
                  {...focusProps('password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* SSRF 경고(차단 아님) */}
            {warnings.map((w) => (
              <p
                key={w}
                style={{
                  margin: 'var(--space-3) 0 0',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-warning)',
                }}
              >
                {w}
              </p>
            ))}

            {/* 에러 배너 */}
            {error && (
              <div
                style={{
                  marginTop: 'var(--space-3)',
                  padding: '8px 10px',
                  background: 'var(--color-error-bg)',
                  border: '1px solid var(--color-error-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-error)',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              {/* Secondary 버튼 — transparent + border, MD 사이즈. radius-md, weight 600.
                  효과 5 — testing 중 accent shimmer가 좌→우로 스윕(진행 피드백). */}
              <button
                onClick={handleTest}
                disabled={busy}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  flex: 1,
                  padding: 'var(--space-2) var(--space-4)',
                  background: testing
                    ? 'linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--color-accent) 28%, transparent) 50%, transparent 70%)'
                    : 'transparent',
                  backgroundSize: testing ? '200% 100%' : undefined,
                  animation: testing ? 'btn-shimmer 1.1s linear infinite' : undefined,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-md)',
                  fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                  transition: 'background var(--transition-base)',
                }}
              >
                {ko ? '연결 테스트' : 'Test Connection'}
              </button>
              {/* Primary 버튼 — accent 배경. Test 통과 시 풀 accent, 전엔 살짝 옅게(가이드 Primary 정신). */}
              <button
                onClick={handleConnect}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: 'var(--space-2) var(--space-4)',
                  background: tested ? 'var(--color-accent)' : 'var(--color-accent-20)',
                  border: '1px solid var(--color-accent-border)',
                  borderRadius: 'var(--radius-md)',
                  color: tested ? 'var(--text-inverse)' : 'var(--text-primary)',
                  fontSize: 'var(--font-size-md)',
                  fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                  transition: 'background var(--transition-base)',
                }}
              >
                {ko ? '연결' : 'Connect'}
              </button>
            </div>
          </motion.div>
        )}

        {/* 교체 모달 재사용 시 Cancel — 두 단계 공통 하단 */}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              display: 'block',
              margin: 'var(--space-4) auto 0',
              padding: '7px 16px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            {ko ? '취소' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}

// 로비 카드 아이콘 — 스키마 메타포 3종(SVG, accent stroke). 화살표류 금지.
type LobbyIcon = 'partition' | 'grid' | 'database';
function CardIcon({ kind }: { kind: LobbyIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'var(--color-accent)',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <span
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-accent-10)',
      }}
    >
      {kind === 'partition' && (
        <svg {...common}><rect x="3" y="4" width="18" height="5" rx="1" /><rect x="3" y="11" width="18" height="9" rx="1" /></svg>
      )}
      {kind === 'grid' && (
        <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
      )}
      {kind === 'database' && (
        <svg {...common}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
      )}
    </span>
  );
}

// 로비 경로 선택 카드(B+C) — 카드 전체가 클릭 영역. hover 시 살짝 떠오름.
// variant: 'sample'=샘플(클릭 즉시 연결) / 'own'=내 DB(강조, accent 틴트 + CTA 텍스트).
// compact=샘플용 축약. icon=스키마 메타포. 화살표류 글리프 미사용.
function LobbyCard({
  title,
  desc,
  variant = 'sample',
  icon,
  cta,
  compact = false,
  disabled = false,
  busy = false,
  onClick,
  ko = false,
}: {
  title: string;
  desc: string;
  variant?: 'sample' | 'own';
  icon?: LobbyIcon;
  cta?: string;
  compact?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  ko?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const isOwn = variant === 'own';
  return (
    <button
      className="glass-trim"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 'var(--space-2)' : 'var(--space-3)',
        padding: compact ? 'var(--space-3) var(--space-4)' : 'var(--space-4)',
        // 내 DB(own)만 accent 틴트로 강조(주 행동). 샘플은 중립 surface.
        background: isOwn
          ? 'linear-gradient(180deg, var(--color-accent-10), transparent), var(--bg-secondary)'
          : 'var(--bg-secondary)',
        border: `1px solid ${isOwn ? 'var(--color-accent-border)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: hover && !disabled ? 'var(--shadow-float)' : 'var(--shadow-card)',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform var(--transition-base), box-shadow var(--transition-base)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        color: 'var(--text-primary)',
      }}
    >
      {/* 아이콘 — compact 샘플은 제목과 한 줄로, own은 위에 단독 배치. */}
      {icon && !compact && <CardIcon kind={icon} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {icon && compact && <CardIcon kind={icon} />}
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{title}</span>
      </div>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
        }}
      >
        {desc}
      </span>
      {/* own: CTA 텍스트(화살표 없이). sample: 로딩 중에만 진행 표시. */}
      {isOwn && cta && (
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-accent)' }}>
          {cta}
        </span>
      )}
      {busy && !isOwn && (
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-accent)' }}>
          {ko ? '불러오는 중…' : 'Loading…'}
        </span>
      )}
    </button>
  );
}
