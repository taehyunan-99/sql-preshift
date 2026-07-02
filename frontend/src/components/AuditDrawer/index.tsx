'use client';

import { useEffect, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';
import { fetchAuditLog, rollbackAudit, type AuditEntry } from '../../lib/api';

// DROP TABLE / DROP COLUMN 등 파괴적 연산 판정 — 역연산이 빈 구조만 복원하므로 데이터는 소실된다.
// 대소문자 무시. ADD COLUMN / CREATE TABLE 등 안전 연산은 매칭되지 않는다.
const DESTRUCTIVE_RE = /\bDROP\s+(TABLE|COLUMN)\b/i;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AuditDrawer() {
  const { auditOpen, closeAudit, language } = usePipelineStore();
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
        // 가짜 이력으로 은폐하지 않음 — 실패를 명시(안전 게이트 신뢰도)
        setEntries([]);
        setError(language === 'ko' ? '이력을 불러오지 못했습니다.' : 'Failed to load history.');
      })
      .finally(() => setLoading(false));
  }, [auditOpen, language]);

  const handleRollback = async (id: string) => {
    setRollingBack(id);
    setError(null);
    try {
      await rollbackAudit(id);
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, rolledBack: true } : e))
      );
    } catch {
      setError(language === 'ko' ? `롤백 실패: ${id}` : `Rollback failed: ${id}`);
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
            {language === 'ko' ? '이력' : 'History'}
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
              {language === 'ko' ? '불러오는 중…' : 'Loading…'}
            </p>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-error)', padding: '4px 0' }}>{error}</p>
          )}

          {!loading && entries.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>
              {language === 'ko' ? '아직 이력이 없습니다.' : 'No history yet.'}
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

              {/* 파괴적 연산 경고 — 롤백해도 삭제된 데이터는 복구되지 않음을 명시. */}
              {DESTRUCTIVE_RE.test(entry.sql) && !entry.rolledBack && (
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 10,
                    lineHeight: 1.4,
                    color: 'var(--color-warning)',
                    background: 'var(--color-warning-bg)',
                    border: '1px solid var(--color-warning)',
                    borderRadius: 3,
                    padding: '4px 6px',
                  }}
                >
                  {language === 'ko'
                    ? '롤백은 구조만 복원하며, 삭제된 데이터는 복구되지 않습니다.'
                    : 'Rollback restores structure only. Dropped data is not recovered.'}
                </p>
              )}

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
                    {language === 'ko' ? '롤백됨' : 'Rolled back'}
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
                    {language === 'ko'
                      ? rollingBack === entry.id
                        ? '롤백 중…'
                        : '롤백'
                      : rollingBack === entry.id
                        ? 'Rolling back…'
                        : 'Rollback'}
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
