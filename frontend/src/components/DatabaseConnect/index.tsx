'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  connectDatabase,
  testConnection,
  type ConnectionStatus,
} from '../../lib/api';
import { usePipelineStore } from '../../store/pipeline';
import LanguageToggle from '../LanguageToggle';
import AppBackdrop from '../AppBackdrop';
import ModelPicker from '../ModelSettings/ModelPicker';

// 온보딩 전체화면 게이트 — target DB 미연결 시 메인 진입 전 노출.
// 단일 경로: 사용자가 자기 PostgreSQL 연결 정보를 입력해 연결한다.
// onConnected로 부모(page)에 상태를 올려 메인(대화창)으로 진입.

interface Props {
  onConnected: (status: ConnectionStatus) => void;
  // 메인에서 교체 모달로 재사용할 때 닫기 버튼 노출. 최초 게이트에선 undefined.
  onCancel?: () => void;
}

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
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [dbname, setDbname] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tested, setTested] = useState(false);

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

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: 440,
          maxWidth: '92vw',
        }}
      >
        {/* 브랜드 헤더 — 진입 stagger fade-up: 타이틀→서브타이틀이 8px 아래에서 순차로 떠오름. */}
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

        {/* 자기 DB 연결 폼 — 진입 fade-up(헤더 stagger의 마지막 요소). */}
        <motion.div
          className="glass-trim"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0.16 }}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-modal)',
            padding: 'var(--space-6)',
          }}
        >
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
                testing 중 accent shimmer가 좌→우로 스윕(진행 피드백). */}
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

        {/* 모델 선택 보조 카드 — 최초 게이트에서만(교체 모달엔 TopBar Model이 따로 있음).
            DB 연결이 주(主)이고 모델은 NL 전용 선택사항임을 위계로 드러낸다(작게, optional 라벨). */}
        {!onCancel && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0.24 }}
            style={{
              marginTop: 'var(--space-4)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-card)',
              padding: 'var(--space-5)',
            }}
          >
            {/* 보조 카드 헤더 — "선택사항 · 자연어용"을 명확히 해 'DB만 연결해도 시작됨'을 전달. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {ko ? '자연어 모델' : 'Language model'}
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '1px var(--space-2)',
                }}
              >
                {ko ? '선택 . 자연어용' : 'Optional . for natural language'}
              </span>
            </div>
            <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {ko
                ? '자연어로 SQL을 작성하려면 모델을 하나 받으세요. SQL 직접 입력은 모델 없이도 됩니다.'
                : 'Download a model to write SQL in natural language. Direct SQL input works without one.'}
            </p>
            <ModelPicker hideHeader />
          </motion.div>
        )}

        {/* 교체 모달 재사용 시 Cancel — 하단 중앙 */}
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
