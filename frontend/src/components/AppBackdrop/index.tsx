'use client';

// 전 화면 공통 배경 — 연결 화면/idle/작업중이 같은 후광 위에 서 있게 한다.
// 이전엔 DatabaseConnect(ambient radial 2개)와 page.tsx(idle radial 1개)가 각자 다른
// 좌표·개수·모션의 teal 오버레이를 복붙해 "같은 듯 다른" 어긋남이 생겼다. 이를 단일
// 컴포넌트로 흡수해, 좌표·색은 전 화면 고정하고 stage에 따라 '강도(opacity)'만 조절한다.
//
// 설계 의도: idle/connect에선 후광이 주역(opacity 1), 작업중(preview/applied)에선 배경이
// 스스로 물러나(opacity 0.4) ERD diff 색광(Diff Bloom)에 무대를 양보한다.
//
// Safari 가드: will-change/translateZ/blur/드리프트 없이 opacity 전이만(메모리
// safari-webkit-rendering 준수). background-position 드리프트는 Safari가 비합성
// repaint로 "둥근 빛이 움직이는" 잔상을 드러내 제거 — aurora는 정지 후광으로 고정.
// pointerEvents:none, aria-hidden.

// stage 의미: 'lobby'=연결/idle 빈 화면(후광 주역), 'work'=작업중(diff에 양보).
type BackdropStage = 'lobby' | 'work';

// 단일 후광 — 상단 중앙 약한 teal aurora. accent-10(12% alpha) 토큰만 사용(하드코딩 0).
// 좌표/색은 전 화면 고정. 움직임 없는 정지 후광(정체성만, 모션 0).
const AURORA =
  'radial-gradient(120% 90% at 50% 30%, var(--color-accent-10) 0%, transparent 55%)';

// 디더 노이즈 — Safari는 어두운 배경 위 저알파 그라데이션을 8bit 단계로 끊어 그려
// 동심원 띠(banding)가 보인다. 아주 옅은 fractal noise를 덧깔아 띠 경계를 흩뜨린다(디더).
// feTurbulence를 data-URI로 인라인 — 추가 파일/요청 없음. baseFrequency가 클수록 고운 입자.
const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface Props {
  stage: BackdropStage;
}

export default function AppBackdrop({ stage }: Props) {
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
      {/* teal aurora 후광 — 패턴 없이 후광만(가장 절제). 움직임 없는 정지 후광. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: AURORA,
        }}
      />
      {/* 디더 노이즈 — aurora 위에 옅게 덧깔아 Safari banding 띠를 흩뜨린다. opacity로
          거의 안 보일 만큼 낮추고, soft-light로 깔아 어두운 영역을 들뜨게 하지 않는다. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: NOISE_SVG,
          backgroundRepeat: 'repeat',
          opacity: 0.035,
          mixBlendMode: 'soft-light',
        }}
      />
    </div>
  );
}
