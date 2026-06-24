'use client';

import { usePipelineStore, type Language } from '../../store/pipeline';

// 전역 UI 언어 토글 — TopBar 거치. 위험/설명/진단 등 한/영 콘텐츠를 한 번에 전환한다.
// 두 가지 표시 언어만(EN | 한국어). active=accent로 현재 언어를 강조.
const LANGS: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'ko', label: '한국어' },
];

export default function LanguageToggle() {
  const language = usePipelineStore((s) => s.language);
  const setLanguage = usePipelineStore((s) => s.setLanguage);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        background: 'var(--bg-tertiary)',
        fontSize: 'var(--font-size-xs)',
      }}
    >
      {LANGS.map(({ value, label }) => {
        const active = language === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLanguage(value)}
            title="Display language"
            style={{
              padding: '4px 10px',
              background: active ? 'var(--color-accent-10)' : 'transparent',
              border: 'none',
              color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
              fontSize: 'inherit',
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
