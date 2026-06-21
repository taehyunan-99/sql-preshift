from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.config import settings

# 앱 메타 DB (audit_log, migration_history, schema_embeddings)
meta_engine = create_engine(settings.database_url)
MetaSession = sessionmaker(bind=meta_engine)

# 대상 DB (스키마 그래프 reflection + SQL 실행)
target_engine = create_engine(settings.target_database_url)


def get_meta_session():
    session = MetaSession()
    try:
        yield session
    finally:
        session.close()


def ensure_vector_extension() -> None:
    with meta_engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
