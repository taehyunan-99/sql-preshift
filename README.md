# SQLPreShift

SQL 스키마 변경을 안전하게 프리뷰·검증·적용하는 워크플로우 도구. 자연어 또는 SQL 직접 입력 → 스키마 diff ERD 시각화 → 위험 감지 → 승인 후 적용 → 롤백까지 단일 파이프라인으로 처리한다.

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

### 2. 서비스 기동

```bash
docker compose up -d
```

4개 서비스(postgres+pgvector, ollama, backend, frontend)가 한 번에 기동된다.

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Health check: http://localhost:8000/health

### 3. Ollama 모델 다운로드

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

`qwen2.5-coder:7b`는 코드 생성·지시 준수·자연어 설명을 균형 있게 처리하는 기본 모델이다. 모델을 바꾸려면 `.env`의 `OLLAMA_MODEL`을 수정한다(sqlcoder, codellama 등 대안 가능).

## 스택

- **Backend**: Python FastAPI + SQLAlchemy + Alembic + pgvector + sqlglot
- **Frontend**: Next.js (TypeScript) + @xyflow/react + dagre + zustand
- **DB**: PostgreSQL 16 + pgvector
- **LLM**: Ollama (OpenAI 호환 `/v1/chat/completions`)
