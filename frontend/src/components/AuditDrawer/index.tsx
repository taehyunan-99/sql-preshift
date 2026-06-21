'use client';

import { useEffect, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';
import { fetchAuditLog, rollbackAudit, type AuditEntry } from '../../lib/api';

// mock 데이터 — 백엔드 미연결 시 폴백
const MOCK_AUDIT: AuditEntry[] = [
  {
    id: 'mock-1',
    sql: 'ALTER TABLE users ADD COLUMN age integer',
    appliedAt: '2026-06-21T10:30:00Z',
    rolledBack: false,
  },
  {
    id: 'mock-2',
    sql: 'CREATE INDEX idx_users_email ON users(email)',
    appliedAt: '2026-06-21T09:15:00Z',
    rolledBack: true,
  },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AuditDrawer() {
  const { auditOpen, closeAudit } = usePipelineStore();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auditOpen) return;
    setLoading(true);
    setError(null);
    fetchAuditLog()
      .then(setEntries)
      .catch(() => {
        // 백엔드 미연결 시 mock 사용
        setEntries(MOCK_AUDIT);
      })
      .finally(() => setLoading(false));
  }, [auditOpen]);

  const handleRollback = async (id: string) => {
    setRollingBack(id);
    setError(null);
    try {
      await rollbackAudit(id);
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, rolledBack: true } : e))
      );
    } catch {
      setError(`롤백 실패: ${id}`);
    } finally {
      setRollingBack(null);
    }
  };

  if (!auditOpen) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 900,
        }}
        onClick={closeAudit}
      />

      {/* 드로어 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 901,
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            적용 이력
          </span>
          <button
            onClick={closeAudit}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {loading && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>
              불러오는 중…
            </p>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-error)', padding: '4px 0' }}>{error}</p>
          )}

          {!loading && entries.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>
              적용 이력이 없습니다.
            </p>
          )}

          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                marginBottom: 10,
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-primary)',
                border: `1px solid ${entry.rolledBack ? 'var(--color-warning)' : 'var(--border)'}`,
              }}
            >
              {/* SQL 미리보기 */}
              <pre
                style={{
                  margin: '0 0 8px',
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  maxHeight: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {entry.sql}
              </pre>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flex: 1 }}>
                  {formatDate(entry.appliedAt)}
                </span>

                {entry.rolledBack ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: 'var(--color-warning-bg)',
                      color: 'var(--color-warning)',
                      border: '1px solid var(--color-warning)',
                    }}
                  >
                    롤백됨
                  </span>
                ) : (
                  <button
                    onClick={() => handleRollback(entry.id)}
                    disabled={rollingBack === entry.id}
                    style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      borderRadius: 3,
                      border: '1px solid var(--color-error)',
                      background: 'var(--color-error-bg)',
                      color: 'var(--color-error)',
                      cursor: rollingBack === entry.id ? 'not-allowed' : 'pointer',
                      opacity: rollingBack === entry.id ? 0.6 : 1,
                    }}
                  >
                    {rollingBack === entry.id ? '롤백 중…' : '롤백'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
