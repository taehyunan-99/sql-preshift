'use client';

// 전 화면 공통 배경 — 연결 화면/idle/작업중이 같은 후광 위에 서 있게 한다.
// 이전엔 DatabaseConnect(ambient radial 2개)와 page.tsx(idle radial 1개)가 각자 다른
// 좌표·개수·모션의 teal 오버레이를 복붙해 "같은 듯 다른" 어긋남이 생겼다. 이를 단일
// 컴포넌트로 흡수해, 좌표·색은 전 화면 고정하고 stage에 따라 '강도(opacity)'만 조절한다.
//
// 설계 의도: idle/connect에선 후광이 주역(opacity 1), 작업중(preview/applied)에선 배경이
// 스스로 물러나(opacity 0.4) ERD diff 색광(Diff Bloom)에 무대를 양보한다.
//
// Safari 가드: will-change/translateZ/blur 없이 background-position 드리프트 + opacity
// 전이만(메모리 safari-webkit-rendering 준수). pointerEvents:none, aria-hidden.

// stage 의미: 'lobby'=연결/idle 빈 화면(후광 주역), 'work'=작업중(diff에 양보).
type BackdropStage = 'lobby' | 'work';

// 단일 후광 — 상단 중앙 약한 teal aurora. accent-10(12% alpha) 토큰만 사용(하드코딩 0).
// 좌표/색은 전 화면 고정. drift는 background-position만 움직여 거의 무인지 수준(22s).
const AURORA =
  'radial-gradient(120% 90% at 50% 30%, var(--color-accent-10) 0%, transparent 55%)';

interface Props {
  stage: BackdropStage;
  // 빈 화면에서만 느린 드리프트로 생기를 준다. 작업중엔 정지(diff bloom과 경쟁 방지).
  drift?: boolean;
}

export default function AppBackdrop({ stage, drift = true }: Props) {
  const lobby = stage === 'lobby';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        // 작업중엔 후광이 물러나 diff 색광에 무대를 내준다.
        opacity: lobby ? 1 : 0.4,
        transition: 'opacity var(--transition-base)',
      }}
    >
      {/* teal aurora 후광 — 패턴 없이 후광만(가장 절제). 빈 화면에서만 느린 드리프트. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: AURORA,
          backgroundSize: '200% 200%',
          animation: drift && lobby ? 'ambient-drift 22s ease-in-out infinite' : undefined,
        }}
      />
    </div>
  );
}
