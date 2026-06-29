// 타임라인 상수 — 30fps 기준. video-scenario.md의 초 단위를 프레임으로 환산.
// 각 ACT의 시작 프레임과 길이를 한 곳에서 관리해 Sequence 배치를 일관되게 한다.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

// 초 → 프레임
export const s = (sec: number) => Math.round(sec * FPS);

// ACT 경계 — 각 막에 클릭/모션을 "확실히 보여줄" 시간을 충분히 둔 타임라인.
// 클릭 비트(눌림→ripple→다음)를 압축하지 않고 여유있게 펼친다. 길이가 늘어도 모션 명료성 우선.
// ACT1: 0~10.0s, ACT2: 10.0~21.6s, ACT3: 21.6~33.0s
export const ACT1_START = s(0);
export const ACT1_DUR = s(10.0); // 타이핑 + Analyze 클릭 + 스피너 + ERD 충분히

export const ACT2_START = s(10.0);
export const ACT2_DUR = s(11.6); // SQL + Analyze 클릭(여운 길게) + 위험 모달 + Undo 클릭 + 안도 화면

export const ACT3_START = s(21.6);
export const ACT3_DUR = s(11.4); // dry-run + Apply 클릭(여운 길게) + shimmer + 완료 풀스크린 + 엔딩

// 총 길이 — 33.0s
export const TOTAL = s(33.0);
