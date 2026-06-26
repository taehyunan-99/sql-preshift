// Electron preload(contextBridge)가 주입하는 전역 — 설치형에서만 존재.
// 웹/dev에선 undefined라 api.ts가 env fallback을 탄다.
interface Window {
  desktop?: { apiBase: string | null };
}
