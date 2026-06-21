"""샘플 스키마 시드: users + orders(FK → users)."""

import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "TARGET_DATABASE_URL",
    "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift",
)

engine = create_engine(DATABASE_URL)

DDL = """
CREATE TABLE IF NOT EXISTS users (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL,
    email   VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS orders (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    total      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
"""

with engine.begin() as conn:
    conn.execute(text(DDL))

print("샘플 시드 완료: users, orders 테이블 생성됨.")
