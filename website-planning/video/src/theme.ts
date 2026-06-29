// 실제 앱 tokens.css에서 가져온 색·폰트 토큰. 영상 전반의 단일 진실.
// hex는 frontend/src/styles/tokens.css와 동일해야 한다(브랜드 일관성).
export const C = {
  // 배경 계층
  bg: '#1A2024', // 앱/캔버스 베이스
  canvas: '#161B1F', // ERD 캔버스(더 어두운 무대)
  surface: '#222A30', // floating 패널/카드 표면
  surfaceHi: '#2E373E', // 노드 헤더/elevated
  input: '#141A1E', // textarea 배경

  // 텍스트
  text: '#E6EBEC',
  textDim: '#9BA8AD',
  textFaint: '#6B767B',
  inverse: '#0F1316',

  // accent (teal)
  accent: '#2BA8A0',
  accentHi: '#34C2B8',

  // diff / semantic
  added: '#5B9A6F',
  removed: '#C45B5B',
  modified: '#C4955A',
  info: '#5A8FC4',

  // 테두리
  border: '#313B41',
  borderSub: '#2A333A',
  borderStrong: '#44515A',
} as const;

// rgba 합성용 raw rgb (glow/틴트 인라인 조합).
export const RGB = {
  accent: '43,168,160',
  added: '91,154,111',
  removed: '196,91,91',
  modified: '196,149,90',
} as const;

// 폰트 — 웹사이트와 동일(Plus Jakarta Sans 본문 + Fira Code mono).
// staticFile로 로드한 woff2를 fontFamily에 매핑한다(Root에서 @font-face 주입).
export const FONT = {
  sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'Fira Code', 'JetBrains Mono', monospace",
} as const;

// 공통 이징 — 모든 ACT가 같은 곡선을 써서 모션 일관성을 확보한다.
// EASE_OUT: 등장(부드럽게 안착), EASE_IN_OUT: 상태 전환, EASE_IN: 퇴장.
// cubic-bezier 근사값(remotion Easing.bezier에 펼쳐 쓴다).
export const EASE = {
  out: [0.22, 1, 0.36, 1] as const, // 강한 out — 등장/안착
  inOut: [0.65, 0, 0.35, 1] as const, // 대칭 — 색/스케일 전환
  in: [0.55, 0, 1, 0.45] as const, // 퇴장
  // 애플식 통통 튀는 안착 — 실제 앱 tokens.css의 --ease-settle와 동일(y=1.2 오버슈트).
  bounce: [0.34, 1.2, 0.64, 1] as const,
} as const;

// spring 설정 프리셋 — 통일된 탄성감.
export const SPRING = {
  // 부드러운 등장(오버슈트 없음) — 패널/카드/모달 공통
  soft: { damping: 200, mass: 0.9 } as const,
  // 살짝 정착감 있는 등장(약한 오버슈트 ~8%) — 모달/ERD/로고처럼 큰 면. 과하지 않게.
  settle: { damping: 17, stiffness: 150, mass: 0.9 } as const,
  // 통통 튀는 등장(뚜렷한 오버슈트 ~19%) — 주인공 요소(버튼·체크·배지·스택)
  pop: { damping: 12, stiffness: 200, mass: 0.85 } as const,
} as const;
