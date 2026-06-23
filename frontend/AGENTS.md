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
- `src/components/` — UI 컴포넌트 (`erd/` ERD 뷰어, `DatabaseConnect/` 연결 온보딩, `InputPanel/`, `SqlDraftPanel/`, `AuditDrawer/`, `DiffControls/`, `StageBadge/`, `CompletedBar/`)
- `src/lib/` — API 클라이언트·유틸 (`api.ts` backend 계약 미러, `erd-layout.ts`, `riskMap.ts`)
- `src/store/` — Zustand 상태 (`pipeline.ts` 메인 플로우, `erdLab.ts`)
- `src/styles/` — 디자인 토큰 (Calm Clarity)
- `scripts/` — 스크린샷 도구 (Playwright `shot-mid.mjs`)

기술 스택: TypeScript, Next.js 15, React 19, Zustand, @xyflow/react(ERD), dagre, Monaco editor, motion, @tanstack/react-query.

## 3. HOW — 일반적인 수정은 어떻게 하는가
<!--
init에서는 placeholder. update 인터뷰("컨벤션 합의" 유형)에서 채운다.
-->

_(update 스킬에서 채워질 자리. 작업 중 패턴이 정립되면 `/update`로 인터뷰 진행)_

## 4. ⛔ HOW NOT — 시스템을 깨뜨리는 비명백한 함정 (중요)
<!--
init에서는 placeholder. update 인터뷰("안티패턴 예측" 유형)에서 채운다.
-->

_(update 스킬에서 채워질 자리. 사용자 결정 사항이므로 init은 비워둔다)_

## 5. WHERE — 다른 모듈과의 의존성

<!--
약결합(마크다운 링크)이 기본값. 강결합(@import)은 "한쪽 변경 = 다른쪽 즉시 깨짐"에만.
사용자 확정: backend ↔ frontend는 약결합 마크다운 링크.
-->

- **의존**: [`backend/AGENTS.md`](../backend/AGENTS.md)의 REST API 계약. 프론트 타입은 [`src/lib/api.ts`](src/lib/api.ts)에 backend `app/schemas/`를 미러링한 것 — backend 스키마가 바뀌면 여기도 갱신해야 한다.
- **경계 / 어댑터**: 모든 backend 호출은 `src/lib/api.ts` 단일 진입점을 거친다. ERD 렌더링은 `@xyflow/react` + `dagre` 레이아웃.

## 6. WHY — 코드에 안 적힌 배경 지식
<!--
init에서는 placeholder. update 인터뷰("암묵지 추출" 유형)에서 채운다.
-->

_(update 스킬에서 채워질 자리. 사용자 결정 사항이므로 init은 비워둔다)_

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
