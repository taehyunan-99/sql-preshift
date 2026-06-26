import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 앱 메타 DB: 설치형 단일 파일(SQLite). audit_log/migration_history/schema_embeddings 저장.
    # 사용자 target DB(아래)와 분리된 앱 소유 인프라 — pgvector 없이 임베딩은 BLOB+numpy 코사인.
    database_url: str = "sqlite:///app_meta.db"
    # 대상 DB: 기동 시 lazy-init 시도용 기본 target(dev/웹). frozen에선 자동연결 안 함.
    target_database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    ollama_base_url: str = "http://localhost:11434"
    # NL→SQL chat 모델 — 기본값을 강제하지 않는다(빈 값=미선택). 설치앱 첫 실행은
    # 미선택 상태로 시작해 NL이 비활성이고, 사용자가 설정에서 모델을 골라 받으면 활성화된다.
    # 웹/docker는 compose가 OLLAMA_MODEL을 주입하므로 그 값을 쓴다(개발 편의).
    ollama_model: str = ""
    # 임베딩 모델 (bge-m3: 1024차원)
    ollama_embed_model: str = "bge-m3:latest"
    # 임베딩 차원 (bge-m3 기본) — BLOB float32 직렬화/numpy 코사인 길이
    embedding_dim: int = 1024

    class Config:
        # frozen이면 runtime_paths.bootstrap_paths가 절대경로를 SIDECAR_ENV_FILE에 넣는다.
        # 개발에선 미설정이라 기존 ".env"(CWD 기준)를 그대로 쓴다.
        env_file = os.environ.get("SIDECAR_ENV_FILE", ".env")


settings = Settings()
