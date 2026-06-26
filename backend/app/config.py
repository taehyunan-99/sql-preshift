from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    # 대상 DB: 기동 시 lazy-init 시도용 기본 target. 샘플은 아래 분리 컨테이너 URL을 쓴다.
    target_database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    # 샘플 전용 분리 컨테이너 URL — 메타 DB(sqlpreshift)와 물리 분리. connect_sample이 kind로 선택.
    sample_erp_url: str = "postgresql+psycopg://demo:demo@pg_erp:5432/erp"
    sample_pagila_url: str = "postgresql+psycopg://postgres:postgres@pg_pagila:5432/pagila"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"
    # 임베딩 모델 (bge-m3: 1024차원)
    ollama_embed_model: str = "bge-m3:latest"
    # pgvector 임베딩 차원 (bge-m3 기본)
    embedding_dim: int = 1024

    class Config:
        env_file = ".env"


settings = Settings()
