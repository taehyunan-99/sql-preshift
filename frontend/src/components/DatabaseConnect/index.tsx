'use client';

import { useState } from 'react';
import {
  connectDatabase,
  connectSampleDatabase,
  testConnection,
  type ConnectionStatus,
  type SampleKind,
} from '../../lib/api';
import { usePipelineStore } from '../../store/pipeline';
import LanguageToggle from '../LanguageToggle';

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

  const req = () => ({ host, port: Number(port) || 5432, user, password, dbname });

  async function handleTest() {
    setBusy(true);
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
      }}
    >
      {/* 언어 토글 — 시작화면엔 TopBar가 없으므로 우상단에 직접 배치(첫 화면부터 한/영 전환). */}
      <div style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)' }}>
        <LanguageToggle />
      </div>

      {/* 브랜드 헤더 — 두 단계 공통(첫인상). */}
      <div
        style={{
          width: step === 'lobby' ? 920 : 440,
          maxWidth: '92vw',
          transition: 'width var(--transition-base)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
            SQLPreShift
          </h1>
          <p
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
          </p>
        </div>

        {step === 'lobby' ? (
          // ── Step 1: 로비 — 경로 선택 카드 3장(샘플 2종 + 자기 DB) ──
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <LobbyCard
                title={ko ? '이커머스 샘플' : 'E-commerce Sample'}
                desc={
                  ko
                    ? '간결한 9테이블 상점 스키마. diff와 승인 흐름을 빠르게 둘러보기에 좋습니다.'
                    : 'A compact 9-table store schema. Best for a quick tour of the diff and approval flow.'
                }
                accent
                disabled={busy}
                busy={loadingKind === 'ecommerce'}
                onClick={() => handleSample('ecommerce')}
                ko={ko}
              />
              <LobbyCard
                title={ko ? 'ERP 샘플' : 'ERP Sample'}
                desc={
                  ko
                    ? '무결성 문제가 내장된 현실적인 92테이블 ERP 스키마. 대규모 진단 탐색에 좋습니다.'
                    : 'A realistic 92-table ERP schema with built-in integrity issues. Best for exploring diagnostics at scale.'
                }
                accent
                disabled={busy}
                busy={loadingKind === 'erp'}
                onClick={() => handleSample('erp')}
                ko={ko}
              />
              <LobbyCard
                title={ko ? '내 DB 연결' : 'Connect Your Own'}
                desc={
                  ko
                    ? 'SQLPreShift를 내 PostgreSQL 데이터베이스에 연결합니다. 읽기 전용 미리보기 — 승인 전까지 아무것도 적용되지 않습니다.'
                    : 'Point SQLPreShift at your PostgreSQL database. Read-only preview; nothing is applied until you approve.'
                }
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep('form');
                }}
                ko={ko}
              />
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
          </div>
        ) : (
          // ── Step 2: 자기 DB 연결 폼 ──
          <div
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
              <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>←</span>
              {ko ? '선택으로 돌아가기' : 'Back to options'}
            </button>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div style={{ flex: 2 }}>
                <label style={LABEL}>Host</label>
                <input style={FIELD} value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Port</label>
                <input style={FIELD} value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <label style={LABEL}>Database</label>
              <input style={FIELD} value={dbname} onChange={(e) => setDbname(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>User</label>
                <input style={FIELD} value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Password</label>
                <input
                  style={FIELD}
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
              {/* Secondary 버튼 — transparent + border, MD 사이즈. radius-md, weight 600. */}
              <button
                onClick={handleTest}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'transparent',
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
          </div>
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

// 로비 경로 선택 카드 — 카드 전체가 클릭 영역. hover 시 살짝 떠오름(메인 카드와 결 맞춤).
// CTA 버튼/텍스트 없이 제목+설명만(클릭은 카드 전체). 샘플 로딩 중에만 'Loading…' 표시.
function LobbyCard({
  title,
  desc,
  accent = false,
  disabled = false,
  busy = false,
  onClick,
  ko = false,
}: {
  title: string;
  desc: string;
  accent?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  ko?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // Calm Clarity Card 스펙: 중립 surface + border-subtle + radius-lg + space-4 패딩.
        // Subtle Accent 원칙 — accent는 카드 배경 장식이 아니라 CTA 텍스트에만(아래).
        flex: 1,
        minWidth: 240,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        // Interactive Card: hover 시 elevation 상승 + translateY(-1px). 기본은 정적 카드 shadow.
        boxShadow: hover && !disabled ? 'var(--shadow-float)' : 'var(--shadow-card)',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform var(--transition-base), box-shadow var(--transition-base)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, // 가이드: Disabled opacity 0.5
        color: 'var(--text-primary)',
      }}
    >
      {/* 제목 — Card 권장: 제목(SemiBold). 본문 토큰 스케일 사용. */}
      <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{title}</span>
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
      {/* CTA 없음 — 카드 전체가 클릭. 샘플 시드 로딩 중에만 진행 표시(피드백). */}
      {busy && accent && (
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-accent)' }}>
          {ko ? '불러오는 중…' : 'Loading…'}
        </span>
      )}
    </button>
  );
}
