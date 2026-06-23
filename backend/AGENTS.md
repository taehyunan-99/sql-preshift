# backend 작업 가이드

스키마 변경 SQL이 메타 DB가 아니라 런타임 연결된 target DB에서만 실행되도록 보장한다 — engine을 잘못 전달하면 사용자 SQL이 앱 인프라 DB를 오염시킨다.

<!--
첫 줄 미션: 코드 스캔 + 메모리([[sqlpreshift-runtime-db-connection]])로 도출한 초안.
모호하면 /update 인터뷰에서 보정.
-->

<!--
== Tradeoff 자리 (선택) ==
형식: `**Tradeoff**: {잃는 것} 포기 → {얻는 것}.`
해당 없으면 아래 한 줄을 통째로 삭제.
-->
**Tradeoff**: meta_engine과 target_engine을 코드에서 항상 명시 전달해야 하는 번거로움을 부담 → 단일 DB 가정에 숨어 있던 메타 DB 오염 버그를 차단한다.

## 1. WHAT — 이 모듈은 무엇을 하는가
<!-- 1-3문장. 시스템 안에서의 역할과 책임. init 코드 스캔 기반 초안. -->

자연어 또는 SQL 입력을 받아 검증 → 스키마 diff → 위험 감지 → 시뮬레이션(dry-run) → 적용/롤백까지 처리하는 FastAPI 백엔드. 메타 DB(audit/migration/embeddings)와 런타임 연결되는 사용자 target DB를 분리해 다룬다.

## 2. CONTENTS — 파일/디렉토리와 기술 스택
<!-- 1-depth 파일 목록 + 추론된 스택. update가 자동 갱신. -->

- `app/api/` — REST 엔드포인트 (`pipeline.py`, `connection.py`, `audit.py`, `schema.py`)
- `app/pipeline/` — 핵심 로직 (`validation.py`, `risk.py`, `simulation.py`, `executor.py`, `nl2sql.py`, `rag.py`, `schema_graph.py`, `input_router.py`, `explain.py`, `connection_validation.py`)
- `app/schemas/` — Pydantic 요청/응답 모델 (`analysis.py`, `connection.py`, `schema_graph.py`)
- `app/models/` — SQLAlchemy ORM 모델 (`audit.py`, `rag.py`)
- `app/llm/` — Ollama 클라이언트 (`client.py`)
- `app/db.py` — meta_engine(불변) + target engine holder(런타임 교체)
- `app/config.py`, `app/main.py`, `app/base.py` — 설정·앱 엔트리·declarative base
- `migrations/` — Alembic + 시드 스크립트 (`seed_ecommerce.py`, `seed_sample.py`, `test_scenarios.py`)
- `tests/` — pytest 스위트 (m2~m7 마일스톤별)

기술 스택: Python, FastAPI, SQLAlchemy 2.0, Alembic, sqlglot, psycopg3, pgvector, Pydantic, PostgreSQL 16. NL→SQL은 Ollama 연동.

## 3. HOW — 일반적인 수정은 어떻게 하는가
<!--
init에서는 placeholder. update 인터뷰("컨벤션 합의" 유형)에서 채운다.
-->

_(update 스킬에서 채워질 자리. 작업 중 패턴이 정립되면 `/update`로 인터뷰 진행)_

## 4. ⛔ HOW NOT — 시스템을 깨뜨리는 비명백한 함정 (중요)
<!--
init에서는 placeholder. update 인터뷰("안티패턴 예측" 유형)에서 코드 스캔 기반 제안 + 사용자 검토로 채운다.
-->

_(update 스킬에서 채워질 자리. 사용자 결정 사항이므로 init은 비워둔다)_

## 5. WHERE — 다른 모듈과의 의존성

<!--
약결합(마크다운 링크)이 기본값. 강결합(@import)은 "한쪽 변경 = 다른쪽 즉시 깨짐"에만.
init에서는 디렉토리 의존성으로 추정 가능한 만큼 초안. 강결합 판단은 사용자 확인.
-->

- **피의존**: [`frontend`](../frontend/AGENTS.md)가 이 영역의 REST API 계약(`app/schemas/`)에 의존한다. 프론트 타입은 [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts)에 미러링되어 있음 — 스키마 변경 시 함께 갱신 대상.
- **경계 / 어댑터**: meta DB(고정) vs target DB(런타임) 분리는 `app/db.py`의 holder + accessor(`get_target_engine` 등). Ollama는 `app/llm/client.py`가 OpenAI 호환 엔드포인트로 호출(호스트 Ollama, Metal GPU — [[sqlpreshift-ollama-host-arch]]).

## 6. WHY — 코드에 안 적힌 배경 지식
<!--
init에서는 placeholder. update 인터뷰("암묵지 추출" 유형)에서 채운다.
-->

_(update 스킬에서 채워질 자리. 사용자 결정 사항이므로 init은 비워둔다)_

## 7. COMMANDS — 빌드/테스트/린트
<!--
init은 추출 가능한 빌드/테스트/린트만. 영역 고유 가드는 update에서.
root map의 공통 가드와 중복 금지.
-->

- 테스트: `docker compose exec -T backend python -m pytest -q`
- 단일 테스트: `docker compose exec -T backend python -m pytest tests/test_m7_e2e.py -q`
- 시드(샘플 e커머스): `docker compose exec -T backend python migrations/seed_ecommerce.py`
- 마이그레이션 생성: `docker compose exec -T backend alembic revision --autogenerate -m "..."`

## 8. ⚠️ LEARNED CAUTIONS — 학습된 주의사항
<!--
누적된 주의사항은 별도 파일 LEARNED_CAUTIONS.md에 보관됩니다.
learn 스킬(/learn 또는 Codex의 $learn)은 LEARNED_CAUTIONS.md에만 항목을 추가하며 이 본문은 수정하지 않습니다.
-->

@./LEARNED_CAUTIONS.md

자세한 내용은 [LEARNED_CAUTIONS.md](./LEARNED_CAUTIONS.md) 참조.
