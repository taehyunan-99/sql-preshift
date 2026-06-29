import React from 'react';
import { C, FONT } from '../theme';

// 실제 앱 InputPanel의 floating pill 입력창 재현.
// focus 시 teal ring glow(셸 전체 점등). 타이핑은 부모가 text를 잘라 전달.

interface Props {
  text: string;
  // 커서 표시 여부(깜빡임은 부모가 제어)
  showCursor?: boolean;
  // focus 강도 0~1 — teal ring glow 보간
  focus?: number;
  // 자동감지 배지 (없으면 미표시)
  badge?: { label: string; pct: number } | null;
  // 배지 통통 등장 스케일 0~1 (pop spring 값). 기본 1.
  badgePop?: number;
  // 분석 중 스피너 + 버튼 라벨 전환
  analyzing?: boolean;
  // 스피너 회전 각도(deg) — 부모가 프레임 기반으로 주입
  spinnerDeg?: number;
  // 우측 액션 버튼 라벨 (기본 Analyze)
  actionLabel?: string;
  // 버튼 강조(teal solid) 여부
  actionEmphasis?: boolean;
  // 액션 버튼 클릭 ripple 진행도 0~1 (Act2 Undo·Act3 Apply와 동일 패턴으로 통일). 0이면 미표시.
  clickRipple?: number;
  // 버튼 눌림 스케일(클릭 순간 0.93까지). 기본 1.
  clickPress?: number;
  width?: number;
}

export const CommandBar: React.FC<Props> = ({
  text,
  showCursor = true,
  focus = 1,
  badge = null,
  badgePop = 1,
  analyzing = false,
  spinnerDeg = 0,
  actionLabel = 'Analyze',
  actionEmphasis = false,
  clickRipple = 0,
  clickPress = 1,
  width = 720,
}) => {
  // focus ring — 앱: 0 0 0 4px accent-10, 0 0 30px -4px accent, shadow-float
  // glow alpha/spread를 낮춤 — 강한 teal glow가 다크 배경에서 압축 banding(청록 얼룩)을 만든다.
  const ringAlpha = 0.1 * focus;
  const glowSpread = 22 * focus;
  const boxShadow =
    `0 0 0 ${3 * focus}px rgba(43,168,160,${ringAlpha}),` +
    `0 0 ${glowSpread}px -6px rgba(43,168,160,${0.4 * focus}),` +
    `0 8px 24px rgba(0,0,0,0.5)`;
  const borderColor = focus > 0.4 ? `rgba(43,168,160,${0.45})` : C.border;

  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        background: C.surface,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        boxShadow,
        fontFamily: FONT.sans,
      }}
    >
      {/* 자동감지 배지 (info 톤) — pop spring으로 통통 등장 */}
      {badge && (
        <div style={{ display: 'flex' }}>
          <span
            style={{
              fontSize: 13,
              padding: '3px 9px',
              borderRadius: 4,
              background: `rgba(90,143,196,0.12)`,
              color: C.info,
              border: `1px solid rgba(90,143,196,0.4)`,
              fontWeight: 600,
              transformOrigin: 'left center',
              transform: `scale(${0.6 + badgePop * 0.4})`,
              opacity: Math.min(1, badgePop * 1.5),
            }}
          >
            {badge.label} {badge.pct}%
          </span>
        </div>
      )}

      {/* 입력 텍스트 영역 (mono) */}
      <div
        style={{
          minHeight: 64,
          padding: 12,
          fontFamily: FONT.mono,
          fontSize: 19,
          lineHeight: 1.6,
          color: C.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 22,
              background: C.accent,
              marginLeft: 1,
              verticalAlign: 'text-bottom',
              transform: 'translateY(3px)',
            }}
          />
        )}
      </div>

      {/* 하단 액션 행 — 우측 정렬 단일 버튼. 클릭 ripple은 버튼 중앙에서 퍼진다(Act2/Act3와 통일). */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }} />
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 22px',
              fontSize: 14,
              fontWeight: actionEmphasis ? 700 : 600,
              borderRadius: 999,
              border: `1px solid ${actionEmphasis ? C.accent : 'rgba(43,168,160,0.45)'}`,
              background: actionEmphasis ? C.accent : 'rgba(43,168,160,0.22)',
              color: actionEmphasis ? C.inverse : C.accent,
              fontFamily: FONT.sans,
              transform: `scale(${clickPress})`,
            }}
          >
            {analyzing && (
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  border: `2px solid ${C.accent}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  transform: `rotate(${spinnerDeg}deg)`,
                }}
              />
            )}
            {actionLabel}
          </button>
          {/* 클릭 ripple — clickRipple 0→1 동안 버튼 중앙에서 원형으로 확산 후 소멸. */}
          {clickRipple > 0 && clickRipple < 1 && (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 10 + clickRipple * 130,
                height: 10 + clickRipple * 130,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `2px solid ${C.accent}`,
                opacity: 0.7 * (1 - clickRipple),
                pointerEvents: 'none',
              }}
            />
          )}
        </span>
      </div>
    </div>
  );
};
