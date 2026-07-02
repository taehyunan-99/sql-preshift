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

- `app/api/` — REST 엔드포인트 (`pipeline.py`, `connection.py`, `audit.py`, `schema.py`, `llm.py`)
- `app/pipeline/` — 핵심 로직 (`validation.py`, `risk.py`, `simulation.py`, `executor.py`, `nl2sql.py`, `rag.py`, `schema_graph.py`, `input_router.py`, `explain.py`, `connection_validation.py`, `diagnostics.py`)
- `app/schemas/` — Pydantic 요청/응답 모델 (`analysis.py`, `connection.py`, `schema_graph.py`)
- `app/models/` — SQLAlchemy ORM 모델 (`audit.py`, `rag.py`, `settings.py`)
- `app/llm/` — Ollama 클라이언트 (`client.py`)
- `app/db.py` — meta_engine(불변) + target engine holder(런타임 교체)
- `app/settings_store.py` — `app_settings` 테이블 key-value 영속(설정값 > config 기본 폴백)
- `app/runtime_paths.py` — frozen(PyInstaller) 감지로 .env/SQLite 경로를 실행 바이너리 기준 고정
- `app/config.py`, `app/main.py`, `app/base.py` — 설정·앱 엔트리·declarative base
- `run_server.py` — PyInstaller sidecar 진입점(uvicorn 프로그래매틱 기동, 동적 포트)
- `sqlpreshift-backend.spec` — PyInstaller onedir 번들 spec
- `migrations/` — Alembic(docker 개발 경로 전용) + 시드 스크립트 (`seed_ecommerce.py`, `seed_erp.py`, `seed_sample.py`, `test_scenarios.py`)
- `tests/` — pytest 스위트 (m2~m7 마일스톤별 + `test_risk_rules.py`, `test_llm_pull.py`, `test_safety_gate_bypass.py` 안전 게이트 우회 회귀)

기술 스택: Python, FastAPI, SQLAlchemy 2.0, sqlglot, psycopg3, Pydantic. NL→SQL은 Ollama 연동.
<!-- prev: PostgreSQL 16 + pgvector + Alembic 고정 (init 2026-06-23) -->
메타 DB는 SQLite(`sqlite:///app_meta.db`, 설치형 기본) + numpy 코사인 유사도 — 3개 테이블뿐이라 pgvector·Alembic 불필요. docker 개발 경로에서는 postgres 메타 DB도 가능하며 이때만 Alembic이 유효하다. 사용자 target DB는 항상 런타임 연결되는 PostgreSQL 16.

## 3. HOW — 일반적인 수정은 어떻게 하는가

- **런타임 설정값**(LLM 모델 태그 등 재시작 후에도 유지돼야 하는 값)은 `settings_store`로 읽고 쓴다 — config 기본값을 직접 읽지 말고 `설정값 > config 기본` 폴백을 거친다.
- **벡터 유사도**는 numpy 코사인으로 계산한다(pgvector 아님). 메타 DB 스키마 변경은 `db.py`의 테이블 정의를 직접 손본다 — Alembic 마이그레이션은 docker 개발 경로에서만 쓴다.

## 4. ⛔ HOW NOT — 시스템을 깨뜨리는 비명백한 함정 (중요)

- **`runtime_paths.bootstrap_paths()`는 config(BaseSettings) import 이전에 호출**해야 한다 — frozen일 때 .env/SQLite 경로를 실행 바이너리 기준으로 주입하기 때문. `run_server.py`가 이 순서를 지킨다. PyInstaller `_MEIPASS`는 재실행마다 휘발하므로 영속 데이터(SQLite)를 거기 두면 안 된다.
- **설치형 SQLite 메타 DB에 Alembic을 돌리거나 pgvector 의존을 추가하지 말 것** — 3개 테이블뿐이고 벡터는 numpy 코사인으로 처리한다. Alembic/pgvector는 docker 개발 경로(postgres 메타) 한정.
- **런타임 변경 값을 config 기본값에서 직접 읽지 말 것** — `app_settings` 테이블(`settings_store`)이 SoT다. config 기본값을 직접 읽으면 사용자가 바꾼 설정(예: LLM 모델 태그)이 무시된다.
- **SQL 검증은 화이트리스트로 fail-closed — 블랙리스트로 위험 구문을 막지 말 것** — `validation.parse`는 `_ALLOWED_STATEMENTS`(DML + 마이그레이션 DDL)에 없는 최상위 노드를 전부 거부한다. sqlglot이 미지원 구문(DO 블록/COPY FROM PROGRAM/CLUSTER/CHECKPOINT/VACUUM 등)을 `Command`/`Copy`/`Alias`/`Column`으로 폴백하기 때문에, 새 위험 구문을 블랙리스트로 하나씩 막으려 하면 `risk.py`가 못 보는 폴백 노드로 새어나간다. 지원 구문을 늘릴 때만 `_ALLOWED_STATEMENTS`에 노드를 추가한다(커밋 e1f4a4e C1). non-public 스키마 대상도 `check_forbidden`이 명시 거부한다 — `build_graph`가 public만 reflection해 diff가 비어 보여도 Apply는 실행되므로(H1). 스키마명 비교는 따옴표를 벗긴 `Identifier.name`으로 한다(인용 식별자 오탐 방지).
- **analyze 응답을 캐시할 때 무한 성장을 막을 것** — `executor._token_cache`는 `OrderedDict` LRU(256 상한, FIFO). apply 없이 analyze만 반복하면 토큰이 무한 누적되므로 `store_token`이 상한 초과분을 가장 오래된 것부터 제거한다(커밋 3eceff4). 새 캐시를 추가할 때도 상한 없는 dict 누적을 피한다.

## 5. WHERE — 다른 모듈과의 의존성

<!--
약결합(마크다운 링크)이 기본값. 강결합(@import)은 "한쪽 변경 = 다른쪽 즉시 깨짐"에만.
init에서는 디렉토리 의존성으로 추정 가능한 만큼 초안. 강결합 판단은 사용자 확인.
-->

- **피의존**: [`frontend`](../frontend/AGENTS.md)가 이 영역의 REST API 계약(`app/schemas/`)에 의존한다. 프론트 타입은 [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts)에 미러링되어 있음 — 스키마 변경 시 함께 갱신 대상.
- **피의존**: [`desktop`](../desktop/AGENTS.md)이 `run_server.py`를 PyInstaller sidecar로 빌드해 spawn한다 — `SQLPRESHIFT_PORT=n` stdout 규약과 `/health` 엔드포인트가 계약이다.
- **경계 / 어댑터**: meta DB(고정) vs target DB(런타임) 분리는 `app/db.py`의 holder + accessor(`get_target_engine` 등). Ollama는 `app/llm/client.py`가 OpenAI 호환 엔드포인트로 호출(호스트 Ollama, Metal GPU — [[sqlpreshift-ollama-host-arch]]). 인앱 모델 다운로드는 `app/api/llm.py`의 `/pull`이 Ollama pull 진행률을 SSE로 중계한다.

## 6. WHY — 코드에 안 적힌 배경 지식

- **메타 DB를 SQLite+numpy로 전환한 이유**: 설치형 배포(단일 바이너리, 외부 postgres 의존 제거)를 위해서다. 운영 DB는 여전히 사용자가 런타임 연결하는 target PostgreSQL이고, SQLite는 audit/migration/embeddings 3개 테이블만 담는 앱 인프라용이다.
- **동적 포트 + `SQLPRESHIFT_PORT` 규약**: sidecar가 매 기동 OS에서 빈 포트를 받아 stdout으로 `SQLPRESHIFT_PORT=n`을 출력하고, Electron이 그걸 파싱한다 — 포트 충돌을 구조적으로 제거하는 설계다(빌드타임 env에 박을 수 없는 이유이기도 함).
- **NL 모델을 미선택 상태로 시작하는 이유**: 기본 NL 모델을 강제하지 않는다(Ollama 미감지 시 SQL 전용으로 동작). 인앱 다운로드(`api/llm.py`의 `/pull` SSE)로 사용자가 명시 선택한다.

## 7. COMMANDS — 빌드/테스트/린트
<!--
init은 추출 가능한 빌드/테스트/린트만. 영역 고유 가드는 update에서.
root map의 공통 가드와 중복 금지.
-->

- 테스트: `docker compose exec -T backend python -m pytest -q`
- 단일 테스트: `docker compose exec -T backend python -m pytest tests/test_m7_e2e.py -q`
- 시드(샘플 e커머스): `docker compose exec -T backend python migrations/seed_ecommerce.py`
  - 데모 DB(ERP/Pagila) 배포는 `samples/`의 선언적 initdb SQL이 담당한다(root map 공통 명령어 참고). `seed_erp.py`는 그 덤프의 "생성기"로 보존 — 시드 구성을 바꿀 때만 1회 실행 후 pg_dump로 재동결한다.
- 마이그레이션 생성(docker 개발 경로 전용): `docker compose exec -T backend alembic revision --autogenerate -m "..."`
- sidecar 빌드 의존성 설치: `uv pip install -e ".[build]"`(pyinstaller — 설치형 패키징 시에만)

**영역 가드**:
- Alembic 명령은 docker 개발 경로(postgres 메타 DB)에서만 유효하다 — 설치형 SQLite 메타 DB에는 적용하지 말 것(3개 테이블, 마이그레이션 불필요).
- 안전 게이트/파이프라인을 수정한 뒤에는 docker pytest만으로 끝내지 말 것 — 패키징 sidecar를 직접 실행해 `/api/analyze` e2e까지 검증한다. docker 경로에는 의존성이 정상 설치돼 있어 sqlglot 방언 번들 누락 같은 패키징 전용 결함을 절대 못 잡는다(커밋 594bde3에서 설치형 dmg e2e로만 실측). sidecar 재빌드는 `.venv-build/bin/pyinstaller --noconfirm --clean sqlpreshift-backend.spec`, 검증은 `dist/sqlpreshift-backend/sqlpreshift-backend` 실행 → stdout `SQLPRESHIFT_PORT=n` 파싱 후 target 연결(localhost:5433 demo DB)로 5케이스(안전/tautology/DROP/VACUUM거부/non-public거부). ([[pyinstaller-sqlglot-dialects]], [[backend-reload-stale-verify]] 참고)

## 8. ⚠️ LEARNED CAUTIONS — 학습된 주의사항
<!--
누적된 주의사항은 별도 파일 LEARNED_CAUTIONS.md에 보관됩니다.
learn 스킬(/learn 또는 Codex의 $learn)은 LEARNED_CAUTIONS.md에만 항목을 추가하며 이 본문은 수정하지 않습니다.
-->

@./LEARNED_CAUTIONS.md

자세한 내용은 [LEARNED_CAUTIONS.md](./LEARNED_CAUTIONS.md) 참조.
