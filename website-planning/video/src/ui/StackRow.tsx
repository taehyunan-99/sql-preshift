import React from 'react';
import { C, FONT } from '../theme';

// dry-run 스택의 한 행 — SQL(mono) + 우측 "dry-run ok" 초록 체크.
// 안전한 변경이 스택에 쌓여 검증 통과한 상태를 표현.

interface Props {
  sql: string;
  // ok 배지 가시성 0~1 (opacity)
  okReveal?: number;
  // ok 배지 통통 스케일 진행 0~1 (pop spring 값) — 오버슈트해서 통통 튐. 없으면 okReveal 사용.
  okPop?: number;
  width?: number;
}

export const StackRow: React.FC<Props> = ({ sql, okReveal = 1, okPop, width = 720 }) => {
  const pop = okPop ?? okReveal;
  return (
    <div
      style={{
        width,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        fontFamily: FONT.mono,
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 16,
          color: C.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {sql}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT.sans,
          color: C.added,
          opacity: okReveal,
          // pop spring 값을 0.7→1로 매핑 — spring이 1을 넘으면 transform이 통통 오버슈트.
          transform: `scale(${0.7 + pop * 0.3})`,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: C.added,
            display: 'inline-block',
          }}
        />
        dry-run ok
      </span>
    </div>
  );
};
