# SQLPreShift

SQL 스키마 변경을 안전하게 프리뷰·검증·적용하는 워크플로우 도구. 자연어 또는 SQL 직접 입력 → 스키마 diff ERD 시각화 → 위험 감지 → 승인 후 적용 → 롤백까지 단일 파이프라인으로 처리한다.

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

### 2. Ollama 준비 (호스트에서 직접 구동)

Ollama는 컨테이너가 아니라 호스트에서 직접 구동한다(Mac Metal GPU 가속). 컨테이너는 `host.docker.internal`로 접속한다.

```bash
ollama serve            # 호스트에서 Ollama 데몬 기동
ollama pull gemma4:latest    # NL→SQL·설명 생성 모델
ollama pull bge-m3:latest    # RAG 임베딩 모델(1024차원)
```

모델을 바꾸려면 `.env`의 `OLLAMA_MODEL`/`OLLAMA_EMBED_MODEL`을 수정한다.

### 3. 서비스 기동

```bash
docker compose up -d
```

3개 서비스(postgres+pgvector, backend, frontend)가 기동된다. backend는 기동 시 메타 DB 마이그레이션(`alembic upgrade head`)을 자동 실행한다.

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Health check: http://localhost:8000/health

## 스택

- **Backend**: Python FastAPI + SQLAlchemy + Alembic + pgvector + sqlglot
- **Frontend**: Next.js (TypeScript) + @xyflow/react + dagre + zustand
- **DB**: PostgreSQL 16 + pgvector
- **LLM**: Ollama (OpenAI 호환 `/v1/chat/completions`)
