// 전역 한/영 표시 헬퍼 — 영어가 source-of-truth(en은 항상 존재), 한국어는 보조 레이어.
// 백엔드 *Ko 필드 토글(message/messageKo 등)과 프론트 하드코딩 문자열 양쪽에서 같은 fallback 규칙을 쓴다.
import type { Language } from '../store/pipeline';

// 선택 언어가 'ko'면 ko를 쓰되 비어있으면 en으로 폴백. 'en'이면 항상 en.
export function pick(lang: Language, en: string, ko?: string | null): string {
  return lang === 'ko' ? ko || en : en;
}

// 컴포넌트에서 t(en, ko) 형태로 쓰기 위한 커링 — const t = useT(); t('Apply', '적용')
export function makeT(lang: Language) {
  return (en: string, ko?: string) => pick(lang, en, ko);
}
