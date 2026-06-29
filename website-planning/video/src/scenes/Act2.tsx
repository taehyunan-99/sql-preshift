import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';
import { C, FONT, EASE, SPRING } from '../theme';
import { CommandBar } from '../ui/CommandBar';
import { RiskModal } from '../ui/RiskModal';
import { s } from '../timing';

// ACT2 — SQL 입력 → 실수 → 경고 → 되돌리기 (로컬 0~7.0s)
// 비트: 입력창 복귀 → SQL 타이핑(DELETE FROM orders;) → Analyze → 위험 모달 → golden-path → Undo
// NOTE: Sequence 안이라 frame=0이 ACT2 시작.

const SQL_TEXT = 'DELETE FROM orders;';

export const Act2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1) 입력창 복귀 (0~0.7s) — 살짝 떠오름(부드러운 진입)
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: s(0.7) });
  const barScale = interpolate(enter, [0, 1], [0.94, 1]);
  const barEnterOpacity = interpolate(frame, [0, s(0.5)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 2) SQL 타이핑 (0.9~2.9s) — 천천히
  const typeStart = s(0.9);
  const typeEnd = s(2.9);
  const charCount = Math.round(
    interpolate(frame, [typeStart, typeEnd], [0, SQL_TEXT.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  const typed = SQL_TEXT.slice(0, charCount);

  // 자동감지 배지 (2.6~3.0s) — Detected: SQL
  const badgeReveal = interpolate(frame, [s(2.6), s(3.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3) Analyze "클릭" — 눌림 + ripple(Act1·Act3와 동일 패턴). ripple 종료(3.45) 뒤 스피너로 넘어가 겹치지 않게.
  const analyzeClickPress = interpolate(frame, [s(3.05), s(3.15), s(3.28)], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const analyzeRipple = interpolate(frame, [s(3.1), s(3.45)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Analyze 스피너 (3.9~4.7s) — 클릭(3.1) 후 다음 단계 전까지 여운을 더 길게(gap 0.8s). 충분히 보여준다(0.8s).
  const analyzing = frame >= s(3.9) && frame < s(4.7);
  const spinDeg = (frame * 12) % 360;

  // 4) 위험 모달 등장 (4.8s~) — 스피너 종료 뒤. 통통 안착(settle: 약한 오버슈트)으로 주의를 끈다.
  const modalStart = s(4.8);
  const modalSpring = spring({ frame: frame - modalStart, fps, config: SPRING.settle, durationInFrames: s(0.7) });
  const modalOpacity = interpolate(frame, [modalStart, modalStart + s(0.45)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const modalScale = interpolate(modalSpring, [0, 1], [0.9, 1]);

  // 위험 등장 임팩트 — ① 적색 비네트 펄스(가장자리가 붉게 번쩍) ② 미세 화면 셰이크.
  // 절제: 셰이크는 0.4s만, 진폭 작게. 비네트는 모달이 떠 있는 동안 은은히 유지.
  const dangerFlash = interpolate(frame, [modalStart, modalStart + s(0.25), modalStart + s(0.8)], [0, 1, 0.3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 셰이크 — 등장 직후 0.4s, 감쇠하는 진동(고주파 sin × 감쇠)
  const shakeT = interpolate(frame, [modalStart, modalStart + s(0.4)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shakeX = Math.sin((frame - modalStart) * 1.6) * 5 * shakeT;
  const shakeY = Math.cos((frame - modalStart) * 1.9) * 3 * shakeT;

  // sizeNote 펄스 (5.6~6.3s) — "규모가 곧 위험" 비트, 한 번 크게
  const pulseT = interpolate(frame, [s(5.6), s(5.95), s(6.3)], [1, 1.18, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  // golden-path 슬라이드인 (6.2~6.9s) — bounce ease로 통통 슬라이드
  const suggestReveal = interpolate(frame, [s(6.2), s(6.9)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(...EASE.bounce),
  });

  // 5) Undo 시퀀스 — 모달 안의 Undo 버튼이 등장(7.3s) → 링 펄스로 시선 유도(8.0~8.8s) →
  //    모달 줌인 강조(8.1~8.7s) → 버튼이 스스로 눌림(8.8s) → 위험 전체 사라짐 → "Removed" 안도 화면.
  // NOTE: 커서는 쓰지 않는다. 영상 전체가 커서 없이 자동 진행되므로 일관성을 위해 Undo도 "눌리는 효과"로만 표현.
  // Undo 버튼 — opacity는 빠르게, 통통 스케일은 pop spring으로(시선 유도).
  const undoBtnReveal = interpolate(frame, [s(7.3), s(7.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const undoBtnPop = spring({ frame: frame - s(7.3), fps, config: SPRING.pop, durationInFrames: s(0.6) });
  const undoRingPulse = interpolate(
    frame,
    [s(8.0), s(8.4), s(8.8)],
    [0, 1, 0.5],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  // 모달 줌인 강조 — Undo로 시선 집중(8.1~8.7s, 1.0→1.04배)
  const modalZoom = interpolate(frame, [s(8.1), s(8.7)], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  // 클릭 눌림 (8.8~9.0s) — 작아졌다가 다시 커짐(눌렀다 떼는 복원). 호흡은 기준 그대로, 시작만 +0.4s 평행이동.
  const clickPress = interpolate(frame, [s(8.8), s(8.9), s(9.02)], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clicked = frame >= s(8.95);

  // 클릭 후 위험 전체가 사라짐 (9.25~9.75s) — 중요: ripple 종료(9.15) 뒤 시작해 효과가 겹치지 않게.
  const dismissStart = s(9.25);
  const dismiss = interpolate(frame, [dismissStart, dismissStart + s(0.5)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const dangerOpacity = interpolate(dismiss, [0, 1], [1, 0]);
  const dangerScale = interpolate(dismiss, [0, 1], [1, 0.92]);

  // "Change removed" 안도 화면 (9.8s~) — 위험이 사라진 직후 통통 안착(settle)으로 등장. 충분히 머묾.
  const reliefStart = s(9.8);
  const reliefSpring = spring({ frame: frame - reliefStart, fps, config: SPRING.settle, durationInFrames: s(0.7) });
  const reliefIn = interpolate(frame, [reliefStart, reliefStart + s(0.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 퇴장 페이드아웃 (11.0~11.6s) — ACT2 끝에서 뚝 끊기지 않고 부드럽게 사라져 ACT3로 이어짐.
  const reliefOut = interpolate(frame, [s(11.0), s(11.6)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const reliefOpacity = reliefIn * reliefOut;
  // 사라질 때 살짝 축소(등장 0.9→1, 퇴장 1→0.97)
  const reliefScale = interpolate(reliefSpring, [0, 1], [0.9, 1]) * interpolate(reliefOut, [0, 1], [0.97, 1]);

  // 입력창은 위험이 사라지면 함께 페이드(모달이 주역이므로)
  const barOpacity = barEnterOpacity * dangerOpacity;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* scrim — 모달 떠 있을 때 배경 dim */}
      {frame >= modalStart && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10,13,15,0.55)',
            opacity: modalOpacity * dangerOpacity,
          }}
        />
      )}

      {/* 적색 위험 비네트 — 화면 가장자리가 붉게 번쩍이며 긴장감. 중앙은 비워 모달 가독성 유지. */}
      {frame >= modalStart && dangerOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(120% 100% at 50% 50%, transparent 45%, rgba(196,91,91,${dangerFlash * 0.22 * dangerOpacity}) 100%)`,
          }}
        />
      )}

      {/* 위험 모달 — 화면 중앙. Undo 강조 시 줌인, 클릭 후 사라짐. Undo 버튼을 모달 하단에 직접 배치. */}
      {frame >= modalStart && dangerOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: modalOpacity * dangerOpacity,
            // 등장 직후 미세 셰이크(shakeX/Y) + scale. 셰이크는 0.4s 만에 감쇠.
            transform: `translate(${shakeX}px, ${shakeY}px) scale(${modalScale * modalZoom * dangerScale})`,
          }}
        >
          <div style={{ position: 'relative' }}>
            <RiskModal
              rule="DELETE_WITHOUT_WHERE"
              message="Deletes every row, no WHERE clause."
              sizeNote="~1.2M rows will be deleted"
              suggestion="add a WHERE clause, or wrap it in a transaction."
              sizePulse={pulseT}
              suggestReveal={suggestReveal}
              width={500}
            />
            {/* Undo 버튼 — 모달 하단 우측에 직접. 위험을 "되돌려 제거"하는 행동임을 모달 맥락에서 보여준다. */}
            {undoBtnReveal > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 16,
                  opacity: undoBtnReveal,
                  // pop spring이라 0을 살짝 넘겨 통통 올라옴
                  transform: `translateY(${interpolate(undoBtnPop, [0, 1], [12, 0])}px)`,
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '11px 24px',
                      fontSize: 15,
                      fontWeight: 700,
                      borderRadius: 10,
                      border: `1px solid ${C.accent}`,
                      background: C.accent,
                      color: C.inverse,
                      fontFamily: FONT.sans,
                      transform: `scale(${clickPress})`,
                      boxShadow: `0 0 0 ${undoRingPulse * 6}px rgba(43,168,160,${undoRingPulse * 0.35})`,
                    }}
                  >
                    Undo this change
                  </span>
                  {/* 클릭 ripple — 버튼 중앙에서 퍼져 "스스로 눌림"을 강조(전 막 동일). 9.15s에 소멸 후 dismiss. */}
                  {frame >= s(8.8) && frame < s(9.15) && (
                    <span
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: interpolate(frame, [s(8.8), s(9.15)], [10, 140]),
                        height: interpolate(frame, [s(8.8), s(9.15)], [10, 140]),
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '50%',
                        border: `2px solid ${C.accent}`,
                        opacity: interpolate(frame, [s(8.8), s(9.15)], [0.7, 0]),
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* "Change removed" 안도 화면 — Undo 클릭 후 위험이 사라지고 안전 상태 복귀를 명확히 보여준다. */}
      {frame >= reliefStart && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            opacity: reliefOpacity,
            transform: `scale(${reliefScale})`,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 28px',
              borderRadius: 999,
              background: 'rgba(43,168,160,0.1)',
              border: `1px solid rgba(43,168,160,0.4)`,
              fontFamily: FONT.sans,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent }} />
            <span style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>Change removed</span>
          </span>
          <span style={{ fontSize: 17, color: C.textDim, fontFamily: FONT.sans, fontWeight: 500 }}>
            Nothing was applied. The stack is clean.
          </span>
        </div>
      )}

      {/* 입력창 — 하단 중앙. SQL 타이핑. 위험이 사라지면 함께 페이드. */}
      {barOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 120,
            display: 'flex',
            justifyContent: 'center',
            transform: `scale(${barScale})`,
            opacity: barOpacity,
          }}
        >
          <CommandBar
            text={typed}
            showCursor={frame >= typeStart && frame < s(3.05) && Math.floor(frame / 15) % 2 === 0}
            focus={1}
            badge={badgeReveal > 0.5 ? { label: 'Detected: SQL', pct: 100 } : null}
            analyzing={analyzing}
            spinnerDeg={spinDeg}
            actionLabel={analyzing ? 'Analyzing…' : 'Analyze'}
            clickRipple={analyzeRipple}
            clickPress={analyzeClickPress}
          />
        </div>
      )}
    </div>
  );
};
