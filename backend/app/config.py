import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 앱 메타 DB: 설치형 단일 파일(SQLite). audit_log/migration_history/schema_embeddings 저장.
    # 사용자 target DB(아래)와 분리된 앱 소유 인프라 — pgvector 없이 임베딩은 BLOB+numpy 코사인.
    database_url: str = "sqlite:///app_meta.db"
    # 대상 DB: 기동 시 lazy-init 시도용 기본 target. 샘플은 아래 분리 컨테이너 URL을 쓴다.
    target_database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    # 샘플 전용 분리 컨테이너 URL — 메타 DB(sqlpreshift)와 물리 분리. connect_sample이 kind로 선택.
    sample_erp_url: str = "postgresql+psycopg://demo:demo@pg_erp:5432/erp"
    sample_pagila_url: str = "postgresql+psycopg://postgres:postgres@pg_pagila:5432/pagila"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"
    # 임베딩 모델 (bge-m3: 1024차원)
    ollama_embed_model: str = "bge-m3:latest"
    # 임베딩 차원 (bge-m3 기본) — BLOB float32 직렬화/numpy 코사인 길이
    embedding_dim: int = 1024

    class Config:
        # frozen이면 runtime_paths.bootstrap_paths가 절대경로를 SIDECAR_ENV_FILE에 넣는다.
        # 개발에선 미설정이라 기존 ".env"(CWD 기준)를 그대로 쓴다.
        env_file = os.environ.get("SIDECAR_ENV_FILE", ".env")


settings = Settings()
