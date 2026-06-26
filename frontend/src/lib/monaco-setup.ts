// Monaco를 self-host로 전환한다(설치형 오프라인 대응).
// @monaco-editor/react 기본 loader는 jsdelivr CDN에서 monaco를 받는데,
// app:// 프로토콜의 오프라인 Electron에선 CDN 접근이 불가하다.
// 번들된 monaco-editor 본체를 loader에 주입해 네트워크 의존을 제거한다.
//
// monaco-editor는 모듈 평가 시 브라우저 전역(window)에 의존하므로 정적 import하면
// static export 프리렌더(Node)에서 깨진다 — 클라이언트에서만 동적 import한다.
import { loader } from '@monaco-editor/react';

if (typeof window !== 'undefined') {
  // 에디터는 SQL 표시 전용 — IntelliSense/언어 워커가 불필요하다.
  // 빈 워커 폴백만 두어 워커 로드 실패 콘솔 에러를 억제한다(과설계 회피).
  (self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker() {
      const code = 'self.onmessage = () => {};';
      const blob = new Blob([code], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    },
  };
  // 동적 import — 프리렌더 시점엔 평가되지 않게.
  import('monaco-editor').then((monaco) => {
    loader.config({ monaco });
  });
}
