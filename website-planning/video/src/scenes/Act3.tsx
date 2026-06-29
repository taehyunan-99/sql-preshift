import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';
import { C, RGB, FONT, SPRING } from '../theme';
import { StackRow } from '../ui/StackRow';
import { s } from '../timing';

// ACT3 — 안전하게 적용 → 완료(풀스크린) → 엔딩 (로컬 0~10.5s)
// 비트: dry-run 스택 2건(부드럽게 등장) → Apply All(2) 강조→눌림 → 트랜잭션 shimmer →
//       Apply 완료 화면 가득 → 엔딩 로고 길게 → loop용 fade-out

const STACK = [
  'ALTER TABLE orders ADD COLUMN status text',
  'CREATE INDEX CONCURRENTLY idx_created ON orders (created_at)',
];

export const Act3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1) 스택 행 등장 (0.3~1.7s) — stagger, 통통 튀게(pop spring으로 살짝 오버슈트)
  const row0 = spring({ frame: frame - s(0.3), fps, config: SPRING.pop, durationInFrames: s(0.9) });
  const row1 = spring({ frame: frame - s(0.7), fps, config: SPRING.pop, durationInFrames: s(0.9) });
  // ok 체크 — opacity만 켜지던 걸 pop spring scale로 통통하게 안착
  const ok0Spring = spring({ frame: frame - s(1.3), fps, config: SPRING.pop, durationInFrames: s(0.6) });
  const ok1Spring = spring({ frame: frame - s(1.7), fps, config: SPRING.pop, durationInFrames: s(0.6) });
  const ok0 = interpolate(frame, [s(1.3), s(1.55)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ok1 = interpolate(frame, [s(1.7), s(1.95)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headerReveal = interpolate(frame, [s(0.2), s(0.7)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 2) Apply All 버튼 — 통통 튀며 등장(2.3s~) → ring pulse → 눌림(클릭)
  const applyStart = s(2.3);
  const applyEnter = spring({ frame: frame - applyStart, fps, config: SPRING.pop, durationInFrames: s(0.7) });
  const applyEnterScale = interpolate(applyEnter, [0, 1], [0.8, 1]);
  const applyEnterOpacity = interpolate(frame, [applyStart, applyStart + s(0.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const applyPulse = interpolate(
    frame,
    [s(3.0), s(3.4), s(3.8)],
    [0, 1, 0.4],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  // 클릭 눌림 — Act2 Undo와 동일한 클릭 호흡으로 통일(기준 타이밍).
  //    클릭 t=4.0: 눌림 [t, t+0.1, t+0.22], ripple [t, t+0.35], 다음 작업 t+0.45.
  const clickScale = interpolate(frame, [s(4.0), s(4.1), s(4.22)], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // clicked(버튼 제거 + shimmer 시작)를 클릭 + 0.8s 뒤로 — ripple 종료 후 여운을 더 길게 두고 넘어간다.
  const clicked = frame >= s(4.8);

  // 3) 트랜잭션 shimmer (4.8~6.15s) — ripple이 사라지고 한 호흡(여운) 더 둔 뒤 시작.
  const shimmerStart = s(4.8);
  const shimmerProgress = interpolate(frame, [shimmerStart, s(6.15)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const applying = frame >= shimmerStart && frame < s(6.15);

  // 스택 전체 페이드아웃 (5.95~6.55s) — Apply 완료 풀스크린에 자리를 내줌
  const stackFade = interpolate(frame, [s(5.95), s(6.55)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 4) Apply 완료 풀스크린 (6.35~8.2s) — 화면 가득. 초록 발광 + 큰 체크 + 텍스트.
  const doneStart = s(6.35);
  // 완료 화면은 살짝 통통하게 안착(settle: 약한 오버슈트) — 풀스크린이라 과하면 멀미나서 pop보다 절제.
  const doneSpring = spring({ frame: frame - doneStart, fps, config: SPRING.settle, durationInFrames: s(1.0) });
  const doneOpacity = interpolate(frame, [doneStart, doneStart + s(0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const doneScale = interpolate(doneSpring, [0, 1], [0.85, 1]);
  // 체크 원 그리기 (6.45~7.25s)
  const checkDraw = interpolate(frame, [s(6.45), s(7.25)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  // 체크 완성 직후 통통 한 번(7.2~7.75s) — pop spring으로 안착감.
  const checkPop = spring({ frame: frame - s(7.2), fps, config: SPRING.pop, durationInFrames: s(0.55) });
  const checkPopScale = interpolate(checkPop, [0, 1], [0.86, 1]);
  // 체크 완성 순간 카타르시스 — 링 확산(7.2~8.05s) + 파티클 버스트.
  const burst = interpolate(frame, [s(7.2), s(8.05)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  // 완료 화면 배경 초록 발광 펄스(은은하게 한 번)
  const doneGlow = interpolate(frame, [doneStart, s(6.95), s(8.35)], [0, 0.5, 0.32], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 완료 화면 → 엔딩으로 페이드아웃 (8.35~8.95s)
  const doneFade = interpolate(frame, [s(8.35), s(8.95)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 5) 엔딩 로고 (8.75s~) — 길게 유지(~1.8s) 후 loop용 사라지는 모션
  const endStart = s(8.75);
  const endIn = interpolate(frame, [endStart, endStart + s(0.9)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 로고 통통 등장 — settle(약한 오버슈트). 엔딩이라 과하지 않게.
  const logoSpring = spring({ frame: frame - endStart, fps, config: SPRING.settle, durationInFrames: s(1.1) });
  const logoInScale = interpolate(logoSpring, [0, 1], [0.9, 1]);
  // 로고 사라지는 모션 (10.8~11.4s) — 엔딩을 더 길게 머문 뒤 살짝 확대되며 페이드아웃(시작 입력창과 이어지게)
  const endOut = interpolate(frame, [s(10.8), s(11.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const logoOpacity = endIn * interpolate(endOut, [0, 1], [1, 0]);
  const logoOutScale = interpolate(endOut, [0, 1], [1, 1.06]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 스택 + Apply 영역 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          opacity: stackFade,
        }}
      >
        {/* 스택 헤더 */}
        <div
          style={{
            width: 720,
            fontSize: 13,
            fontWeight: 600,
            color: C.textDim,
            fontFamily: FONT.sans,
            marginBottom: 2,
            opacity: headerReveal,
            transform: `translateY(${interpolate(headerReveal, [0, 1], [8, 0])}px)`,
          }}
        >
          2 changes staged · dry-run passed
        </div>

        {/* 행 0 */}
        <div style={{ opacity: row0, transform: `translateY(${interpolate(row0, [0, 1], [18, 0])}px)`, position: 'relative' }}>
          <StackRow sql={STACK[0]} okReveal={ok0} okPop={ok0Spring} />
          {applying && <ShimmerOverlay progress={shimmerProgress} />}
        </div>
        {/* 행 1 */}
        <div style={{ opacity: row1, transform: `translateY(${interpolate(row1, [0, 1], [18, 0])}px)`, position: 'relative' }}>
          <StackRow sql={STACK[1]} okReveal={ok1} okPop={ok1Spring} />
          {applying && <ShimmerOverlay progress={shimmerProgress} delay={0.15} />}
        </div>

        {/* Apply All 버튼 — 부드러운 등장 + 눌림 + 클릭 ripple(Act1 Analyze·Act2 Undo와 동일 패턴으로 통일).
            중요: ripple이 완전히 끝난 뒤(4.4s) clicked로 전환돼 shimmer가 시작 → 효과가 겹치지 않는다. */}
        {frame >= applyStart && !clicked && (
          <span style={{ position: 'relative', display: 'inline-flex', marginTop: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                padding: '11px 28px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 999,
                border: `1px solid ${C.accent}`,
                background: C.accent,
                color: C.inverse,
                fontFamily: FONT.sans,
                opacity: applyEnterOpacity,
                transform: `scale(${applyEnterScale * clickScale})`,
                boxShadow: `0 0 0 ${applyPulse * 6}px rgba(43,168,160,${applyPulse * 0.32})`,
              }}
            >
              Apply All (2)
            </span>
            {/* 클릭 ripple — 버튼 중앙에서 퍼져 "스스로 눌림"을 강조(Act2 Undo와 동일 호흡: t~t+0.35). */}
            {frame >= s(4.0) && frame < s(4.35) && (
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: interpolate(frame, [s(4.0), s(4.35)], [10, 140]),
                  height: interpolate(frame, [s(4.0), s(4.35)], [10, 140]),
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: `2px solid ${C.accent}`,
                  opacity: interpolate(frame, [s(4.0), s(4.35)], [0.7, 0]),
                  pointerEvents: 'none',
                }}
              />
            )}
          </span>
        )}
        {applying && (
          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: C.accent, fontFamily: FONT.sans }}>
            Applying… single transaction
          </div>
        )}
      </div>

      {/* Apply 완료 풀스크린 — 화면 가득 초록 발광 + 큰 체크 + 텍스트 */}
      {frame >= doneStart && doneFade > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            opacity: doneOpacity * doneFade,
          }}
        >
          {/* 배경 초록 발광 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(60% 50% at 50% 48%, rgba(${RGB.added},${doneGlow * 0.5}), transparent 70%)`,
            }}
          />
          {/* 큰 체크 원 + 카타르시스 효과(확산 링 + 파티클 버스트) */}
          <div style={{ transform: `scale(${doneScale * checkPopScale})`, position: 'relative' }}>
            {/* 확산 링 + 파티클 — 체크보다 큰 viewBox(360)로 바깥까지 퍼지게. 체크 원은 중앙(180,180). */}
            <svg
              width={360}
              height={360}
              viewBox="0 0 360 360"
              fill="none"
              style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}
            >
              {/* 확산 링 2개 — 시차를 두고 바깥으로 퍼지며 사라짐 */}
              {[0, 0.18].map((delay, ri) => {
                const rp = interpolate(burst, [delay, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                if (rp <= 0) return null;
                return (
                  <circle
                    key={ri}
                    cx="180"
                    cy="180"
                    r={70 + rp * 100}
                    stroke={C.added}
                    strokeWidth={2}
                    opacity={(1 - rp) * 0.5}
                  />
                );
              })}
              {/* 파티클 버스트 — 12개 입자가 방사형으로 튀어나가며 페이드 */}
              {Array.from({ length: 12 }).map((_, pi) => {
                const ang = (pi / 12) * Math.PI * 2;
                // 입자별 거리 편차(고르지 않게) — pi 기반 의사난수
                const dist = 70 + ((pi * 37) % 40) + burst * (60 + ((pi * 53) % 50));
                const px = 180 + Math.cos(ang) * dist;
                const py = 180 + Math.sin(ang) * dist;
                const pOpacity = interpolate(burst, [0, 0.3, 1], [0, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return <circle key={pi} cx={px} cy={py} r={2.5} fill={C.added} opacity={pOpacity} />;
              })}
            </svg>
            <svg width={140} height={140} viewBox="0 0 140 140" fill="none" style={{ position: 'relative' }}>
              <circle cx="70" cy="70" r="64" stroke={`rgba(${RGB.added},0.35)`} strokeWidth="3" />
              <circle
                cx="70"
                cy="70"
                r="64"
                stroke={C.added}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={Math.PI * 2 * 64}
                strokeDashoffset={(1 - checkDraw) * Math.PI * 2 * 64}
                transform="rotate(-90 70 70)"
              />
              {/* 체크 마크 */}
              <path
                d="M44 72 L62 90 L96 52"
                stroke={C.added}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={90}
                strokeDashoffset={(1 - interpolate(checkDraw, [0.4, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })) * 90}
              />
            </svg>
          </div>
          <div style={{ textAlign: 'center', transform: `scale(${doneScale})` }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em', color: C.added, fontFamily: FONT.sans }}>
              2 changes applied
            </div>
            <div style={{ marginTop: 12, fontSize: 19, color: C.textDim, fontFamily: FONT.sans, fontWeight: 500 }}>
              Committed in a single transaction
            </div>
          </div>
        </div>
      )}

      {/* 엔딩 로고 + 태그라인 — 길게 유지 후 사라짐(loop 이음새) */}
      {frame >= endStart && logoOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            opacity: logoOpacity,
            transform: `scale(${logoInScale * logoOutScale})`,
          }}
        >
          <div
            style={{
              fontSize: 60,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: C.text,
              fontFamily: FONT.sans,
              textShadow: `0 0 40px rgba(43,168,160,0.45)`,
            }}
          >
            SQL<span style={{ color: C.accent }}>PreShift</span>
          </div>
          <div style={{ fontSize: 21, color: C.textDim, fontFamily: FONT.sans, fontWeight: 500 }}>
            Stop it before you apply it.
          </div>
        </div>
      )}
    </div>
  );
};

// 트랜잭션 진행 shimmer — 행 위를 좌→우로 스윕하는 teal 빛띠.
const ShimmerOverlay: React.FC<{ progress: number; delay?: number }> = ({ progress, delay = 0 }) => {
  const p = Math.max(0, Math.min(1, progress - delay));
  const x = interpolate(p, [0, 1], [-30, 110]);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${x}%`,
          width: '30%',
          background: `linear-gradient(90deg, transparent, rgba(43,168,160,0.35), transparent)`,
        }}
      />
    </div>
  );
};
