'use client';

import { useState } from 'react';
import { usePipelineStore, type RiskItem } from '../../store/pipeline';
import { matchTable } from '../../lib/riskMap';

const LEVEL_CONFIG = {
  critical: {
    label: 'CRITICAL',
    color: 'var(--color-error)',
    bg: 'var(--color-error-bg)',
    border: 'var(--color-error-border)',
    icon: '🚨',
  },
  warning: {
    label: 'WARNING',
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-bg)',
    border: 'var(--color-warning-border)',
    icon: '⚠',
  },
  info: {
    label: 'INFO',
    color: 'var(--color-info)',
    bg: 'var(--color-info-bg)',
    border: 'var(--color-info-border)',
    icon: 'ℹ',
  },
};

function RiskCard({
  risk,
  table,
  onHover,
}: {
  risk: RiskItem;
  table: string | null;
  onHover?: (table: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = LEVEL_CONFIG[risk.level];

  return (
    <div
      onMouseEnter={() => table && onHover?.(table)}
      onMouseLeave={() => table && onHover?.(null)}
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        overflow: 'hidden',
        transition: 'all var(--transition-base)',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-sm)',
          padding: '10px var(--space-md)',
          background: 'transparent',
          border: 'none',
          cursor: risk.llmNote ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: cfg.color,
                letterSpacing: '0.06em',
              }}
            >
              {cfg.label}
            </span>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {risk.rule}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            {risk.message}
          </p>
        </div>

        {risk.llmNote && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              flexShrink: 0,
              marginTop: 2,
              transition: 'transform var(--transition-fast)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▾
          </span>
        )}
      </button>

      {/* LLM 해설 아코디언 */}
      {risk.llmNote && expanded && (
        <div
          style={{
            padding: '8px var(--space-md) var(--space-md)',
            borderTop: `1px solid ${cfg.border}`,
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-xs)',
            }}
          >
            LLM 해설
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {risk.llmNote}
          </p>
        </div>
      )}
    </div>
  );
}

export default function RiskPanel({
  open,
  onToggle,
  onRiskHover,
}: {
  // open 전달 시 controlled(page가 제어). 미전달 시 자체 collapsed 폴백.
  open?: boolean;
  onToggle?: (open: boolean) => void;
  onRiskHover?: (table: string | null) => void;
}) {
  const { analyzeResult } = usePipelineStore();
  const [localOpen, setLocalOpen] = useState(true);
  const isOpen = open ?? localOpen;
  const collapsed = !isOpen;
  const toggle = () => {
    const next = !isOpen;
    setLocalOpen(next);
    onToggle?.(next);
  };

  // risks===0 / 결과 없음이면 미렌더(focus-reveal graft, 빈 패널 노이즈 제거).
  // page.tsx도 조건부 렌더하지만 이중 가드로 빈 시트 방지.
  if (!analyzeResult || analyzeResult.risks.length === 0) return null;

  const risks = analyzeResult.risks;
  const criticalCount = risks.filter((r) => r.level === 'critical').length;
  const warningCount = risks.filter((r) => r.level === 'warning').length;

  // hover→노드 매핑용 실제 테이블명 집합(before+after).
  const tables = Array.from(
    new Set([
      ...analyzeResult.schemaDiff.before.nodes.map((n) => n.table),
      ...analyzeResult.schemaDiff.after.nodes.map((n) => n.table),
    ]),
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        bottom: 88,
        right: 0,
        width: 360,
        display: 'flex',
        // 접힘 시 핸들만 보이도록 시트를 우측으로 밀어냄(언마운트 아님)
        transform: collapsed ? 'translateX(calc(100% - 32px))' : 'translateX(0)',
        transition: 'transform var(--transition-slow)',
        zIndex: 38,
        pointerEvents: 'auto',
      }}
    >
      {/* 세로 핸들 — 접어도 위험 숫자 유지 */}
      <button
        onClick={toggle}
        style={{
          flexShrink: 0,
          width: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-sm)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRight: 'none',
          borderTopLeftRadius: 'var(--radius-md)',
          borderBottomLeftRadius: 'var(--radius-md)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-float)',
          padding: 'var(--space-sm) 0',
        }}
        title={collapsed ? '위험 패널 열기' : '위험 패널 접기'}
      >
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {collapsed ? '◀' : '▶'}
        </span>
        {criticalCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)' }}>
            🔴{criticalCount}
          </span>
        )}
        {warningCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-warning)' }}>
            🟡{warningCount}
          </span>
        )}
      </button>

      {/* 시트 본체 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-float)',
          overflow: 'hidden',
        }}
      >
        {/* 고정 헤더 — critical 배너 흡수 + 카운트 배지 */}
        <div
          style={{
            flexShrink: 0,
            padding: '10px var(--space-md)',
            borderBottom: '1px solid var(--border)',
            background: criticalCount > 0 ? 'var(--color-error-bg)' : 'var(--bg-secondary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              위험 분석
            </span>
            <div style={{ flex: 1 }} />
            {criticalCount > 0 && (
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 700,
                  color: 'var(--color-error)',
                }}
              >
                🔴 {criticalCount}
              </span>
            )}
            {warningCount > 0 && (
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 700,
                  color: 'var(--color-warning)',
                }}
              >
                🟡 {warningCount}
              </span>
            )}
          </div>

          {/* critical 차단 안내 — 별도 전역 배너 대신 헤더에 흡수 */}
          {criticalCount > 0 && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              🚨 CRITICAL 위험이 감지되었습니다. 적용 전 반드시 확인 모달을 통해 위험을 인지하세요.
            </p>
          )}
        </div>

        {/* 위험 목록 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}
        >
          {risks.map((risk, i) => (
            <RiskCard
              key={i}
              risk={risk}
              table={matchTable(risk, tables)}
              onHover={onRiskHover}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
