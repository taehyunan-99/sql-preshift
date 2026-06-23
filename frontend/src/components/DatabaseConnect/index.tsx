'use client';

import { useState } from 'react';
import {
  connectDatabase,
  connectSampleDatabase,
  testConnection,
  type ConnectionStatus,
} from '../../lib/api';

// 온보딩 전체화면 게이트 — target DB 미연결 시 메인 진입 전 노출.
// 두 경로: Try Sample Database(e-commerce 시드 즉시작동) / Connect Your Own DB.
// onConnected로 부모(page)에 연결 상태를 올려 메인으로 진입시킨다.

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
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [dbname, setDbname] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tested, setTested] = useState(false);

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
      setError('Connection test failed. Check that the backend is running.');
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
      setError(e instanceof Error ? e.message : 'Failed to connect.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSample() {
    setBusy(true);
    setError(null);
    try {
      const status = await connectSampleDatabase();
      onConnected(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sample database.');
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
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '90vw',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-modal)',
          padding: 'var(--space-6)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
          Connect a Database
        </h1>
        <p
          style={{
            margin: '6px 0 var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          SQLPreShift previews schema changes against a live PostgreSQL database.
          Try the sample or connect your own.
        </p>

        {/* 샘플 경로 — 클릭 한 번 체험 */}
        <button
          onClick={handleSample}
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px',
            background: 'var(--color-accent-20)',
            border: '1px solid var(--color-accent-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-md)',
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          Try with Sample Database
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            margin: 'var(--space-4) 0',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          or connect your own
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* 자기 DB 경로 — 분리 필드 */}
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
          <button
            onClick={handleTest}
            disabled={busy}
            style={{
              flex: 1,
              padding: '9px',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Test Connection
          </button>
          <button
            onClick={handleConnect}
            disabled={busy}
            style={{
              flex: 1,
              padding: '9px',
              background: tested ? 'var(--color-accent)' : 'var(--color-accent-20)',
              border: '1px solid var(--color-accent-border)',
              borderRadius: 'var(--radius-md)',
              color: tested ? 'var(--text-inverse)' : 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Connect
          </button>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              width: '100%',
              marginTop: 'var(--space-3)',
              padding: '7px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
