import React from 'react';
import { C, FONT } from '../theme';

// 실제 앱 InputPanel의 위험 경고 모달 재현(critical).
// 상단 4px 색 밴드 + CRITICAL 배지 + rule(mono) + message + sizeNote(mono, 펄스) + golden-path(accent).

interface Props {
  rule: string;
  message: string;
  sizeNote: string;
  suggestion: string;
  // sizeNote 펄스 강조 스케일(1~1.x) — "규모가 곧 위험" 비트
  sizePulse?: number;
  // golden-path 슬라이드인 진행 0~1
  suggestReveal?: number;
  width?: number;
}

export const RiskModal: React.FC<Props> = ({
  rule,
  message,
  sizeNote,
  suggestion,
  sizePulse = 1,
  suggestReveal = 1,
  width = 460,
}) => {
  return (
    <div
      style={{
        width,
        background: C.surface,
        border: `1px solid ${C.removed}`,
        borderTop: `4px solid ${C.removed}`,
        borderRadius: 8,
        padding: 26,
        boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
        fontFamily: FONT.sans,
      }}
    >
      {/* 헤더: CRITICAL 배지 + 제목 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '3px 8px',
            borderRadius: 4,
            color: C.removed,
            background: `rgba(196,91,91,0.12)`,
            border: `1px solid ${C.removed}`,
          }}
        >
          CRITICAL
        </span>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.removed }}>Critical risk detected</span>
      </div>

      {/* 설명 문구 */}
      <p style={{ margin: '0 0 14px', fontSize: 14, color: C.textDim, lineHeight: 1.6 }}>
        This change carries a critical risk. Remove it with Undo, or, if this is intended, dismiss
        this dialog and press Apply All to proceed.
      </p>

      {/* 위험 카드 */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 4,
          background: `rgba(196,91,91,0.12)`,
          border: `1px solid rgba(196,91,91,0.4)`,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.removed,
            letterSpacing: '0.05em',
            fontFamily: FONT.mono,
            marginBottom: 5,
          }}
        >
          {rule}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.5 }}>{message}</p>
        {/* sizeNote — 펄스 강조(규모=위험) */}
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 14,
            fontFamily: FONT.mono,
            color: C.removed,
            lineHeight: 1.4,
            fontWeight: 700,
            transform: `scale(${sizePulse})`,
            transformOrigin: 'left center',
            display: 'inline-block',
          }}
        >
          {sizeNote}
        </p>
        {/* golden-path — accent, 슬라이드인 */}
        {suggestReveal > 0.01 && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 13,
              color: C.accent,
              lineHeight: 1.5,
              opacity: suggestReveal,
              transform: `translateX(${(1 - suggestReveal) * -12}px)`,
            }}
          >
            <span style={{ fontWeight: 700 }}>Suggested </span>
            {suggestion}
          </p>
        )}
      </div>
    </div>
  );
};
