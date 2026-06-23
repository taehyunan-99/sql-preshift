'use client';

// ERD 카드 단일 디자인 "Crisp Slab Glass": 본체 불투명(텍스트 선명),
// 유리감은 가장자리(specular trim + 다층 그림자)에서만. 글로벌 룰(diff·위험·핸들) 불변.
export const CARD_SURFACE = {
  background: 'var(--bg-secondary)', // #222A30 불투명 — 텍스트 뒤 blur 없음
  radius: 'var(--radius-lg)',
  headerBg: 'var(--bg-tertiary)', // #2E373E 불투명 헤더
};
