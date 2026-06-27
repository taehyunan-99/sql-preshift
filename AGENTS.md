# SQLPreShift - AI 에이전트 작업 지침

API contract는 backend가 SoT(single source of truth)다. frontend는 그 정의(`backend/app/schemas/`, `frontend/src/lib/api.ts`)를 따른다.

<!--
== Tradeoff 자리 ==
형식: `**Tradeoff**: {잃는 것} 포기 → {얻는 것}.`
해당 없으면 아래 한 줄을 통째로 삭제.
-->
**Tradeoff**: 영역 경계가 모호한 작업은 두 가이드를 모두 읽어야 함 — 약간의 토큰 비용을 부담하는 대신 단일 거대 가이드의 lost-in-the-middle을 차단한다.

<!--
이 파일은 map 역할을 한다. 작업 시 해당 영역의 AGENTS.md를 먼저 읽고 진행한다.
root에 모든 가이드를 몰아넣지 않고 영역별로 분리한 이유는 토큰 효율 + 컨텍스트 정확도다.
디렉토리 트리는 의도적으로 넣지 않는다 (G1 안티패턴 — ls로 알 수 있는 정보).
-->

## 영역별 가이드

작업 영역에 해당하는 AGENTS.md를 먼저 읽고 진행한다.

- **backend** — FastAPI 파이프라인·API·DB·LLM 작업 → [`backend/AGENTS.md`](backend/AGENTS.md)
- **frontend** — Next.js UI·ERD·store 작업 → [`frontend/AGENTS.md`](frontend/AGENTS.md)
- **desktop** — Electron 셸·sidecar spawn·패키징 작업 → [`desktop/AGENTS.md`](desktop/AGENTS.md)

## 영역 가이드의 구조

<!--
각 영역의 AGENTS.md는 다음 8섹션 템플릿을 따른다.
init은 가벼운 뼈대만 만든다 — WHAT/CONTENTS/WHERE/COMMANDS(빌드·테스트·린트)는 코드 스캔 기반 초안,
HOW/HOW NOT/WHY는 placeholder. 본격 작성은 베이스라인 완성 즈음 /update 인터뷰로 채운다.
-->

1. **WHAT** — 이 모듈이 무엇을 하는가 *(init에서 채움)*
2. **CONTENTS** — 디렉토리 맵 + 기술 스택 *(init에서 채움)*
3. **HOW** — 일반적인 수정은 어떻게 하는가 *(`/update` 인터뷰에서 채움)*
4. **HOW NOT** — 시스템을 깨뜨리는 비명백한 함정 *(`/update` 인터뷰에서 채움)*
5. **WHERE** — 다른 모듈과의 의존성 *(init에서 채움)*
6. **WHY** — 코드에 안 적힌 배경 지식 *(`/update` 인터뷰에서 채움)*
7. **COMMANDS** — 빌드/테스트/린트 + 영역 고유 명령어 가드 *(init은 빌드/테스트/린트만, 가드는 `/update`)*
8. **LEARNED CAUTIONS** — 별도 파일 `LEARNED_CAUTIONS.md`에 분리. `learn` 스킬이 누적

## 공통 명령어

<!--
모든 영역에 공통으로 적용되는 명령어. 영역별 명령어는 각 가이드의 7. COMMANDS 참고.
-->

- 전체 기동: `docker compose up -d` (postgres + backend + frontend) — docker 개발 경로. 이때 메타 DB는 postgres이며 Alembic이 유효하다. 설치형 기본 메타 DB는 SQLite다([`backend/AGENTS.md`](backend/AGENTS.md) WHY 참고).
- 백엔드 테스트: `docker compose exec -T backend python -m pytest -q`
- 프론트 타입체크: `cd frontend && npx tsc --noEmit`
- 프론트 린트: `cd frontend && npm run lint`

**데모 DB (앱에서 일반 연결 폼으로 붙는 실제 PostgreSQL)**:

- 기동: `docker compose up -d pg_erp pg_pagila` — 앱은 `localhost:5433`(ERP 92테이블) / `localhost:5434`(Pagila)에 붙는다.
- `samples/`의 선언적 initdb SQL을 첫 기동에만 자동 적재 — 재적재하려면 volume 비우고 재생성: `docker compose down -v pg_erp pg_pagila && docker compose up -d pg_erp pg_pagila`.
- 메타 DB(앱 인프라)와 물리 분리된 별도 컨테이너다 — 사용자 작업은 이쪽 target DB에서만 실행된다.

**공통 명령어 가드** (모든 영역에 적용):

<!-- prev: 메타 DB를 `sqlpreshift`(postgres) 단일로 명시 (init 2026-06-23) → 설치형 SQLite 전환으로 DB 종류 비의존 가드로 일반화 (2026-06-27) -->
- 메타 DB에 사용자 마이그레이션 SQL 직접 실행 금지 — 설치형은 SQLite(`app_meta.db`), docker 개발 경로는 postgres(`sqlpreshift`)이며 둘 다 audit_log/migration_history/schema_embeddings 소유 인프라다. 사용자 작업은 런타임 연결된 target DB에서만 실행된다. ([[sqlpreshift-runtime-db-connection]] 참고)
- UI에 노출되는 문자열은 전부 영어로 작성 — 코드 주석만 한국어. ([[sqlpreshift-ui-english]])
- UI에 이모지 사용 금지.

## 주의사항 학습 (learn 스킬)

<!--
작업 중 실수가 발견되면 다음 형태로 호출해 해당 영역 폴더의 LEARNED_CAUTIONS.md에 누적한다.
본문 가이드(AGENTS.md)는 8번 섹션에서 @./LEARNED_CAUTIONS.md를 참조하므로 자동 로드된다.
learn 스킬은 LEARNED_CAUTIONS.md만 갱신하고 본문 가이드는 절대 건드리지 않는다.
-->

- Claude Code/Cursor/Antigravity: `/learn <메모>` (인자 없이도 호출 가능)
- Codex: `$learn <메모>`

스킬 위치: `.claude/skills/learn/` (Claude), `.agents/skills/learn/` (Codex/Cursor/Antigravity)
