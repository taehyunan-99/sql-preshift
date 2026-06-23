"""현실적 e커머스 스키마 시드 — 실수 시나리오 테스트용.

테이블 8개 + 다단계 FK로 "참조되는 테이블 DROP" 같은 위험이 연쇄로 드러나게 구성.
의존 그래프:
  categories ←(self parent_id) categories
  categories ← products
  users ← addresses, orders, reviews
  products ← order_items, reviews, inventory
  orders ← order_items, payments
  addresses ← orders (shipping_address_id)
"""

import os

from sqlalchemy import create_engine, text

# 기존 단순 시드(users/orders/products)를 의존 역순으로 정리 후 재구성.
DROP = """
DROP TABLE IF EXISTS payments      CASCADE;
DROP TABLE IF EXISTS order_items    CASCADE;
DROP TABLE IF EXISTS reviews        CASCADE;
DROP TABLE IF EXISTS inventory      CASCADE;
DROP TABLE IF EXISTS orders         CASCADE;
DROP TABLE IF EXISTS addresses      CASCADE;
DROP TABLE IF EXISTS products       CASCADE;
DROP TABLE IF EXISTS categories     CASCADE;
DROP TABLE IF EXISTS users          CASCADE;
"""

DDL = """
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(200) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    parent_id   INTEGER REFERENCES categories(id)
);

CREATE TABLE products (
    id           SERIAL PRIMARY KEY,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    name         VARCHAR(200) NOT NULL,
    price        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
    id           SERIAL PRIMARY KEY,
    product_id   INTEGER NOT NULL UNIQUE REFERENCES products(id),
    quantity     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE addresses (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    line1        VARCHAR(200) NOT NULL,
    city         VARCHAR(100) NOT NULL,
    postal_code  VARCHAR(20) NOT NULL
);

CREATE TABLE orders (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    shipping_address_id  INTEGER REFERENCES addresses(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    total                NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id),
    product_id   INTEGER NOT NULL REFERENCES products(id),
    quantity     INTEGER NOT NULL DEFAULT 1,
    unit_price   NUMERIC(10, 2) NOT NULL
);

CREATE TABLE payments (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id),
    amount       NUMERIC(10, 2) NOT NULL,
    method       VARCHAR(30) NOT NULL,
    paid_at      TIMESTAMP
);

CREATE TABLE reviews (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    product_id   INTEGER NOT NULL REFERENCES products(id),
    rating       INTEGER NOT NULL,
    comment      TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
"""

def seed(target_engine) -> None:
    """e커머스 샘플 스키마를 대상 엔진에 시드한다(드롭 후 재생성).

    'Try Sample Database' 온보딩이 이 함수를 재사용한다(import 부작용 없이).
    """
    with target_engine.begin() as conn:
        conn.execute(text(DROP))
        conn.execute(text(DDL))


if __name__ == "__main__":
    database_url = os.environ.get(
        "TARGET_DATABASE_URL",
        "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift",
    )
    seed(create_engine(database_url))
    print(
        "e커머스 시드 완료: users, categories, products, inventory, "
        "addresses, orders, order_items, payments, reviews (9 tables)."
    )
