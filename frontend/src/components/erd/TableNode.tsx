'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import ColumnRow from './ColumnRow';
import { useRiskMap } from './ErdDiffViewer';
import type { NodeDef } from '../../lib/api';

const DIFF_BADGE: Record<string, { label: string; color: string }> = {
  added: { label: '+Added', color: 'var(--color-success)' },
  removed: { label: '−Removed', color: 'var(--color-error)' },
  modified: { label: '~Modified', color: 'var(--color-warning)' },
  unchanged: { label: '', color: 'transparent' },
};

// diff별 노드 강조용 색 토큰 (보더/글로우 동색)
const DIFF_ACCENT: Record<string, string> = {
  added: 'var(--color-success)',
  removed: 'var(--color-error)',
  modified: 'var(--color-warning)',
  unchanged: 'var(--border)',
};

// diff별 외곽 글로우 (box-shadow blur용, 알파 0.45 — 캔버스 위 또렷). hex는 semantic 동일.
const DIFF_GLOW: Record<string, string> = {
  added: 'var(--color-success-glow)',
  removed: 'var(--color-error-glow)',
  modified: 'var(--color-warning-glow)',
  unchanged: 'transparent',
};

// 변경 노드 헤더 동색 틴트 (은은한 보조 단서, 알파 0.12). 줌아웃 시 색 식별 보강.
const DIFF_HEADER_BG: Record<string, string> = {
  added: 'var(--color-success-bg)',
  removed: 'var(--color-error-bg)',
  modified: 'var(--color-warning-bg)',
  unchanged: 'transparent',
};

// 위험 배지 (헤더, diff 배지 좌측). RiskPanel 시각언어와 일관.
const RISK_BADGE: Record<'critical' | 'warning', { icon: string; color: string; label: string }> = {
  critical: { icon: '🚨', color: 'var(--color-error)', label: 'Critical risk' },
  warning: { icon: '⚠', color: 'var(--color-warning)', label: 'Warning' },
};

export default function TableNode({ data }: NodeProps) {
  const node = data as unknown as NodeDef;
  const badge = DIFF_BADGE[node.diff] ?? DIFF_BADGE.unchanged;
  const isChanged = node.diff !== 'unchanged';
  const accent = DIFF_ACCENT[node.diff] ?? DIFF_ACCENT.unchanged;
  const glow = DIFF_GLOW[node.diff] ?? DIFF_GLOW.unchanged;
  const isRemoved = node.diff === 'removed';

  // 위험 level 조회(Context). 매칭 안 되면 undefined → 배지 없음(graceful).
  const riskMap = useRiskMap();
  const riskLevel = riskMap[node.table];
  const risk = riskLevel ? RISK_BADGE[riskLevel] : null;

  // removed만 "사라짐" 암시로 살짝 dim. 그 외(unchanged 포함)는 풀 opacity — 어두움 해소.
  const opacity = isRemoved ? 0.55 : 1;

  return (
    <div
      style={{
        minWidth: 240,
        borderRadius: 'var(--radius-md)',
        // 변경 노드: 선명한 1px 동색 링 + blur 16px 후광(알파 0.45) + 카드 그림자. 그 외 기본 그림자
        boxShadow: isChanged
          ? `0 0 0 1px ${accent}, 0 0 16px 2px ${glow}, var(--shadow-card)`
          : 'var(--shadow-card)',
        overflow: 'hidden',
        // 변경 노드 동색 2px 보더, unchanged는 윤곽 가시화용 strong 보더
        border: isChanged ? `2px solid ${accent}` : '1px solid var(--border-strong)',
        opacity,
        // removed 노드: 대각 빗금 오버레이로 "사라짐" 암시
        position: 'relative',
      }}
    >
      {/* removed 대각 빗금 오버레이 (클릭 비침범) */}
      {isRemoved && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--color-error-bg) 0, var(--color-error-bg) 6px, transparent 6px, transparent 12px)',
          }}
        />
      )}
      {/* 헤더 */}
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          // 변경 노드만 동색 틴트를 bg-tertiary 위에 합성(은은한 보조 단서)
          background: isChanged
            ? `linear-gradient(${DIFF_HEADER_BG[node.diff]}, ${DIFF_HEADER_BG[node.diff]}), var(--bg-tertiary)`
            : 'var(--bg-tertiary)',
          gap: 8,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--text-primary)',
            flex: 1,
          }}
        >
          {node.table}
        </span>
        {/* 위험 배지 — diff 배지 좌측. 위험이 먼저 읽히도록(우선순위 시각화) */}
        {risk && (
          <span
            title={risk.label}
            style={{
              fontSize: 11,
              lineHeight: 1,
              color: risk.color,
              border: `1px solid ${risk.color}`,
              borderRadius: 3,
              padding: '2px 5px',
              flexShrink: 0,
            }}
          >
            {risk.icon}
          </span>
        )}
        {badge.label && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: badge.color,
              color: 'var(--text-inverse)',
              borderRadius: 'var(--radius-sm)',
              padding: '1px 6px',
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* 컬럼 행 */}
      {node.columns.map((col) => (
        <div key={col.name} style={{ position: 'relative' }}>
          {/* FK 소스 핸들 (우측) */}
          {col.fk && (
            <Handle
              type="source"
              position={Position.Right}
              id={col.name}
              style={{
                top: 14,
                background: 'var(--color-warning)',
                width: 8,
                height: 8,
              }}
            />
          )}
          {/* PK 타겟 핸들 (좌측) */}
          {col.pk && (
            <Handle
              type="target"
              position={Position.Left}
              id={col.name}
              style={{
                top: 14,
                background: 'var(--color-success)',
                width: 8,
                height: 8,
              }}
            />
          )}
          <ColumnRow column={col} />
        </div>
      ))}
    </div>
  );
}
