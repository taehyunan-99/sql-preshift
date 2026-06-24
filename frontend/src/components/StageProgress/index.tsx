'use client';

import { useEffect, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline';

// 분석 진행 단계 — 백엔드는 단일 응답이라 정확한 타이밍은 모른다.
// 응답이 보통 수초~10초+ 걸리는 동안 '멈췄나?' 인상을 없애려 단계를 순차 점등하는 연출형 로더.
// 마지막 단계는 응답이 올 때까지 진행 상태로 유지(완료되면 컴포넌트 자체가 언마운트됨).
const STEPS: { en: string; ko: string }[] = [
  { en: 'Generating SQL', ko: 'SQL 생성 중' },
  { en: 'Simulating diff', ko: '변경 시뮬레이션 중' },
  { en: 'Assessing risk', ko: '위험 평가 중' },
];

const STEP_INTERVAL_MS = 1100; // 단계 점등 간격(연출 — 실제 단계 경계 아님)

/**
 * StageProgress — 분석/적용 중 풀스크린 진행 표시.
 * active=true일 때만 의미. variant로 분석(단계 점등) / 적용(단순 라벨)을 구분한다.
 */
export default function StageProgress({
  active,
  variant,
}: {
  active: boolean;
  variant: 'analyzing' | 'applying';
}) {
  const language = usePipelineStore((s) => s.language);
  const ko = language === 'ko';
  const [step, setStep] = useState(0);

  // active 진입 시 0부터 시작해 마지막 단계까지 순차 진행(거기서 멈춤 — 응답 대기).
  useEffect(() => {
    if (!active || variant !== 'analyzing') {
      setStep(0);
      return;
    }
    setStep(0);
    const id = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, variant]);

  if (variant === 'applying') {
    return (
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--font-size-md)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        <Spinner />
        {ko ? '적용 중…' : 'Applying…'}
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 220,
      }}
    >
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        const color = done
          ? 'var(--color-success)'
          : current
            ? 'var(--text-primary)'
            : 'var(--text-tertiary)';
        return (
          <div
            key={s.en}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: current ? 700 : 500,
              color,
              transition: 'color var(--transition-base), font-weight var(--transition-base)',
            }}
          >
            {/* 상태 마커 — 완료=success dot, 진행 중=스피너, 대기=빈 원 */}
            {done ? (
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--color-success)',
                  flexShrink: 0,
                }}
              />
            ) : current ? (
              <Spinner size={14} />
            ) : (
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid var(--border-strong)',
                  flexShrink: 0,
                }}
              />
            )}
            {ko ? s.ko : s.en}
          </div>
        );
      })}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid var(--color-accent)',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}
