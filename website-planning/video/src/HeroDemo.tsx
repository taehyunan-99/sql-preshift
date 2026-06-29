import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';
import { C } from './theme';
import { Act1 } from './scenes/Act1';
import { Act2 } from './scenes/Act2';
import { Act3 } from './scenes/Act3';
import { ACT1_START, ACT1_DUR, ACT2_START, ACT2_DUR, ACT3_START, ACT3_DUR, TOTAL, FPS, s } from './timing';

// 배경 — 앱 캔버스 톤 + 천천히 떠다니는 teal 광원(패럴랙스). Linear/Stripe식 "살아있는" 배경.
// noise 레이어는 쓰지 않는다(banding/노이즈 원인). 광원은 옅은 단색 radial이라 gradfun으로 평활됨.
const Backdrop: React.FC<{ frame: number }> = ({ frame }) => {
  // 두 광원이 서로 다른 주기의 사인파로 부유 — 결코 같은 자리에 머물지 않아 화면이 숨 쉰다.
  const t = frame / FPS;
  const g1x = 42 + Math.sin(t * 0.18) * 8;
  const g1y = 40 + Math.cos(t * 0.13) * 6;
  const g2x = 66 + Math.sin(t * 0.11 + 2) * 7;
  const g2y = 62 + Math.cos(t * 0.16 + 1) * 7;
  // 그리드도 아주 미세하게 흐름 — 패럴랙스 깊이감
  const gridShift = (t * 3) % 64;

  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      {/* 떠다니는 그리드 — 깊이감용. 아주 옅게(banding 안 나게 점 작고 대비 낮음) */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(rgba(70,84,92,0.18) 0.7px, transparent 0.7px)`,
          backgroundSize: '64px 64px',
          backgroundPosition: `${gridShift}px ${gridShift * 0.5}px`,
        }}
      />
      {/* 광원 1 — 주 teal 발광. 사인파로 천천히 부유 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 100% at ${g1x}% ${g1y}%, rgba(43,168,160,0.07) 0%, transparent 50%)`,
        }}
      />
      {/* 광원 2 — 보조 발광. 반대 위상으로 움직여 화면 전체가 미묘하게 출렁임 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(90% 80% at ${g2x}% ${g2y}%, rgba(43,168,160,0.045) 0%, transparent 55%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const HeroDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // loop 이음새 — 콘텐츠만 시작 0.6s fade-in + 끝 0.8s fade-out.
  // 배경(Backdrop)은 페이드하지 않아 톤이 끝~시작 내내 일정하다(배경색 튐 방지).
  const contentIn = interpolate(frame, [0, s(0.6)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const contentOut = interpolate(frame, [TOTAL - s(0.8), TOTAL], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const contentOpacity = contentIn * contentOut;

  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      {/* 배경 패럴랙스 — loop fade에서 제외해 톤이 일정. 광원이 천천히 부유한다. */}
      <Backdrop frame={frame} />
      {/* 콘텐츠 레이어만 in/out 페이드 — 끝에서 배경만 남고 시작으로 매끄럽게 이어짐. */}
      <AbsoluteFill style={{ opacity: contentOpacity }}>
        <Sequence from={ACT1_START} durationInFrames={ACT1_DUR}>
          <Act1 />
        </Sequence>
        <Sequence from={ACT2_START} durationInFrames={ACT2_DUR}>
          <Act2 />
        </Sequence>
        <Sequence from={ACT3_START} durationInFrames={ACT3_DUR}>
          <Act3 />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
