from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    # 대상 DB: 기본값은 메타 DB와 동일 (샘플 시드용)
    target_database_url: str = "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"
    # 임베딩 모델 (bge-m3: 1024차원)
    ollama_embed_model: str = "bge-m3:latest"
    # pgvector 임베딩 차원 (bge-m3 기본)
    embedding_dim: int = 1024

    class Config:
        env_file = ".env"


settings = Settings()
