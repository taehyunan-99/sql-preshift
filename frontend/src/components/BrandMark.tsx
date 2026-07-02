/* SQLPreShift 브랜드 심볼 — Safe-Gate Shield.
   앱 아이콘/파비콘과 동일한 방패+체크 마크(배경 타일 없는 심볼 전용).
   size는 렌더 픽셀(정사각 기준 폭). 헤더/온보딩에서 워드마크 앞에 둔다. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="253 238 518 614"
      role="img"
      aria-label="SQLPreShift"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="bmSym" x1="512" y1="252" x2="512" y2="792" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3ACDC2" />
          <stop offset="0.55" stopColor="#31B8AE" />
          <stop offset="1" stopColor="#279E96" />
        </linearGradient>
        <radialGradient
          id="bmGloss"
          cx="512"
          cy="300"
          r="300"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1 0 0 0.9 0 30)"
        >
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.40" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <path
          id="bmShield"
          d="M 512,258 C 579,309 656,337 735,346 C 744,347 751,355 751,364 L 751,530 C 751,662 668,754 522,819 C 516,822 508,822 502,819 C 356,754 273,662 273,530 L 273,364 C 273,355 280,347 289,346 C 368,337 445,309 512,258 Z"
        />
        <clipPath id="bmShieldClip">
          <use href="#bmShield" />
        </clipPath>
      </defs>
      <use href="#bmShield" fill="url(#bmSym)" />
      <g clipPath="url(#bmShieldClip)">
        <rect x="273" y="258" width="478" height="564" fill="url(#bmGloss)" />
        <path
          d="M 512,258 C 579,309 656,337 735,346 C 744,347 751,355 751,364 L 751,398 C 665,389 590,360 512,305 C 434,360 359,389 273,398 L 273,364 C 273,355 280,347 289,346 C 368,337 445,309 512,258 Z"
          fill="#EAEFF0"
          fillOpacity="0.26"
        />
      </g>
      <path
        d="M 408,516 L 476,586 L 622,434 L 672,484 L 494,668 C 489,673 481,673 476,668 L 358,546 Z"
        fill="#F2F6F6"
      />
    </svg>
  );
}
