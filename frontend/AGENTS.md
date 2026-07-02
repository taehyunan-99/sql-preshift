# frontend 작업 가이드

UI에 노출되는 모든 문자열은 영어로 작성하고, backend REST API 계약을 단일 진실로 따른다 — 화면 한국어 노출과 API 타입 임의 변경을 막는다.

<!--
첫 줄 미션: 코드 스캔 + 메모리([[sqlpreshift-ui-english]])로 도출한 초안.
모호하면 /update 인터뷰에서 보정.
-->

<!--
== Tradeoff 자리 (선택) ==
형식: `**Tradeoff**: {잃는 것} 포기 → {얻는 것}.`
해당 없으면 아래 한 줄을 통째로 삭제.
-->
**Tradeoff**: API 변경 시 backend 스키마와 `lib/api.ts`를 함께 손봐야 하는 수고를 부담 → 프론트의 침묵의 타입 가정으로 인한 런타임 깨짐을 차단한다.

## 1. WHAT — 이 모듈은 무엇을 하는가
<!-- 1-3문장. init 코드 스캔 기반 초안. -->

SQL 변경 워크플로우의 UI. 입력(NL/SQL) → 스키마 diff ERD 시각화 → 위험 표시 → 승인/적용 → 롤백을 단일 화면 파이프라인으로 보여준다. 첫 진입 시 런타임 DB 연결 온보딩 게이트를 거친다.

## 2. CONTENTS — 파일/디렉토리와 기술 스택
<!-- 1-depth 파일 목록 + 추론된 스택. -->

- `src/app/` — Next.js App Router 페이지 (`page.tsx` = 메인 파이프라인 화면)
- `src/components/` — UI 컴포넌트 (`erd/` ERD 뷰어, `DatabaseConnect/` 연결 온보딩, `InputPanel/`, `AuditDrawer/`, `DiffControls/`, `StageBadge/`, `StageProgress/`, `CompletedBar/`, `DiagnosticsPanel/` 무결성 진단, `ModelSettings/` LLM 선택·다운로드, `LanguageToggle/`, `AppBackdrop/`, `AppliedToast/`, `BrandMark.tsx` Safe-Gate Shield 심볼 SVG)
<!-- prev: SqlDraftPanel/ 포함 (init 2026-06-23) → 삭제됨(커밋 b47e9dc 이후 D) -->
- `src/lib/` — API 클라이언트·유틸 (`api.ts` backend 계약 미러, `erd-layout.ts`, `riskMap.ts`, `diagnostics.ts`, `i18n.ts` 한/영 헬퍼, `monaco-setup.ts` self-host loader)
- `src/store/` — Zustand 상태 (`pipeline.ts` 메인 플로우, `erdLab.ts`)
- `src/types/` — 타입 선언 (`desktop.d.ts` — `window.desktop.apiBase` 등 Electron 브릿지)
- `src/styles/` — 디자인 토큰 (Calm Clarity)
- `scripts/` — 스크린샷 도구 (Playwright `shot-mid.mjs`)

기술 스택: TypeScript, Next.js 15(설치형은 `output:"export"` 정적), React 19, Zustand, @xyflow/react(ERD), dagre, Monaco editor(self-host), motion, @tanstack/react-query.

## 3. HOW — 일반적인 수정은 어떻게 하는가

- **표시 문자열은 i18n 헬퍼로 작성**한다: `const t = makeT(lang); t('Apply', '적용')`. 영어가 source-of-truth(필수), 한국어는 보조 — `pick(lang, en, ko)`가 ko 비면 en으로 폴백한다. 백엔드 `*Ko` 필드 토글과 같은 규칙.
- **새 backend 호출은 `src/lib/api.ts` 단일 진입점**에 추가한다 — `API_BASE`(설치형 동적 포트 우선)를 거치는 fetch 래퍼로.

## 4. ⛔ HOW NOT — 시스템을 깨뜨리는 비명백한 함정 (중요)

- **Monaco를 CDN loader 기본값으로 두지 말 것** — `@monaco-editor/react`는 jsdelivr CDN에서 받는데 설치형 `app://` 오프라인에선 불가. 번들된 monaco를 `monaco-setup.ts`가 loader에 주입하고, monaco는 `window` 의존이라 클라이언트에서만 동적 import한다(static export 프리렌더 깨짐 방지).
- **`API_BASE`를 `localhost:8000`으로 하드코딩하지 말 것** — `window.desktop?.apiBase`(설치형 동적 포트)를 먼저 읽고 env로 폴백해야 한다. 하드코딩하면 설치형에서 백엔드를 못 찾는다.
- **표시 문자열에 en 없이 ko만 추가하지 말 것** — en이 source-of-truth라 누락 시 폴백이 깨진다. UI 영어 방침([[sqlpreshift-ui-english]])과 같은 결.
- **BrandMark SVG의 gradient/clip id는 반드시 고유 prefix(`bm*`)로 격리할 것** — 파비콘 `app/icon.svg`와 같은 페이지에 동시 렌더될 때 `linearGradient`/`clipPath` id가 겹치면 브라우저가 마지막 정의로 덮어써 심볼 렌더가 깨진다. 새 인라인 SVG를 추가할 때도 id 충돌을 피한다([[app-icon-safe-gate-shield]]).
- **critical apply 게이트를 단일 항목 기준으로 판정하지 말 것** — 게이트는 `resultCache` 스택 '전체'를 집계해야 한다. 스택 일부(예: 마지막 항목)만 보면 [critical, safe] 순서에서 먼저 쌓인 미확인 critical이 confirm 없이 통과하거나 데드락에 빠진다(커밋 e1f4a4e H4).

## 5. WHERE — 다른 모듈과의 의존성

<!--
약결합(마크다운 링크)이 기본값. 강결합(@import)은 "한쪽 변경 = 다른쪽 즉시 깨짐"에만.
사용자 확정: backend ↔ frontend는 약결합 마크다운 링크.
-->

- **의존**: [`backend/AGENTS.md`](../backend/AGENTS.md)의 REST API 계약. 프론트 타입은 [`src/lib/api.ts`](src/lib/api.ts)에 backend `app/schemas/`를 미러링한 것 — backend 스키마가 바뀌면 여기도 갱신해야 한다.
- **경계 / 어댑터**: 모든 backend 호출은 `src/lib/api.ts` 단일 진입점을 거친다. ERD 렌더링은 `@xyflow/react` + `dagre` 레이아웃.
- **의존(설치형)**: [`desktop`](../desktop/AGENTS.md)이 `window.desktop.apiBase`로 동적 백엔드 포트를 주입한다 — `src/lib/api.ts`의 `API_BASE`가 이걸 우선 읽는다. 타입은 `src/types/desktop.d.ts`.

## 6. WHY — 코드에 안 적힌 배경 지식

- **설치형은 정적 export(`output:"export"`) + `app://` 프로토콜로 오프라인 구동**한다 — 그래서 Monaco self-host, CDN 의존 제거, 클라이언트 전용 동적 import가 강제된다. 동일 코드가 dev(`localhost:3000`)와 packaged(`app://`) 양쪽에서 돌아야 한다.
- **i18n은 영어 우선 + 한국어 보조 레이어**다 — UI 노출 문자열은 영어가 SoT, 한국어는 토글 시에만 덧입힌다([[sqlpreshift-ui-english]]). 백엔드도 `message`/`messageKo` 쌍으로 같은 규칙을 따른다.

## 7. COMMANDS — 빌드/테스트/린트
<!--
init은 추출 가능한 빌드/테스트/린트만. 영역 고유 가드는 update에서.
-->

- 개발 서버: `npm run dev`
- 빌드: `npm run build`
- 린트: `npm run lint`
- 타입체크: `npx tsc --noEmit`

## 8. ⚠️ LEARNED CAUTIONS — 학습된 주의사항
<!--
누적된 주의사항은 별도 파일 LEARNED_CAUTIONS.md에 보관됩니다.
learn 스킬(/learn 또는 Codex의 $learn)은 LEARNED_CAUTIONS.md에만 항목을 추가하며 이 본문은 수정하지 않습니다.
-->

@./LEARNED_CAUTIONS.md

자세한 내용은 [LEARNED_CAUTIONS.md](./LEARNED_CAUTIONS.md) 참조.
