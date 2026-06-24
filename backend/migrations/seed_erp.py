"""대형 e커머스/ERP 시드 — 92테이블, 무결성 진단 데모/성능 검증용.

기존 seed_ecommerce.py(9테이블, 'Try Sample' 온보딩 재사용)는 건드리지 않는다.
이 시드는 수동 실행 전용:
    docker compose exec -T backend python migrations/seed_erp.py

설계 근거(현업 조사 Spree/Magento/Odoo/Oracle + 진단 엔진 실측 규칙):
- 진단 케이스를 현실적으로 배치 — 일부 테이블에만 자연 발생, 대부분 깨끗.
- false-positive 차단 케이스(denylist/polymorphic/sentinel)도 함께 심어 음성 입증.

진단 트리거 매핑(diagnostics.py 규칙):
- Orphan 양성: feature_flags(denylist 미해당, FK·*_id 없음).
  음성: audit_log/event_log/email_log(*_log denylist), import_staging(_staging denylist).
- Implicit FK 양성: notifications.user_id(FK 없음 → users 복수형 medium).
  음성: comments.commentable_id(+commentable_type polymorphic 가드), import_staging.external_id(denylist).
- High-NULL 양성: shipments.return_id 99% NULL(near-saturation, 실 FK).
  음성: orders.coupon_id 85% NULL(임계 0.98 미달).
- Broken RI 양성: order_items.product_id 고아값 2행(NOT VALID FK).
  soft-delete: products.deleted_at + order_items가 참조 → informational gray.
  음성: orders.coupon_id=0(sentinel 0/-1 제외).

함정:
- orphan 의도 테이블엔 <table>_id 매칭 컬럼 금지(암묵 엣지 붙으면 orphan에서 빠짐).
- broken RI는 실 FK(NOT VALID 포함)에만 → VALIDATE 절대 실행 안 함(고아 때문에 실패).
- High-NULL은 pg_stats 의존 → 말미 ANALYZE 필수.
- seed(target_engine)만 받음 — meta_engine 금지(메타 DB 오염 방지).
"""

import os

from sqlalchemy import create_engine, text

# 앱 메타 테이블 — target DB가 메타 DB(sqlpreshift)와 동일할 때 이것까지 날리면 앱이 깨진다.
# DROP 대상에서 제외(메타 DB 오염 방지, AGENTS.md 가드).
_META_TABLES = ("alembic_version", "audit_log", "migration_history", "schema_embeddings")

# 메타 테이블을 뺀 public 스키마의 모든 테이블을 동적으로 DROP CASCADE.
# (74개를 손으로 역순 나열하면 취약 — 동적 생성이 안전. DDL이 재생성하므로 누락 무해.)
# 시드 테이블명은 메타 4테이블(특히 audit_log)과 안 겹치게 둔다 — 겹치면 보존된 메타와
# CREATE 충돌 + build_graph가 메타로 제외해 denylist 입증 불가. 시드는 activity_log 사용.
DROP = """
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('alembic_version','audit_log','migration_history','schema_embeddings')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;
"""

# CREATE는 의존 정순: lookup → core → txn → 후행 → orphan/log.
DDL = """
-- ===== LOOKUP / GEO =====
CREATE TABLE countries (
    id          SERIAL PRIMARY KEY,
    iso_code    VARCHAR(2) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE states (
    id          SERIAL PRIMARY KEY,
    country_id  INT NOT NULL REFERENCES countries(id),
    code        VARCHAR(10) NOT NULL,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE return_reasons (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);

-- ===== CATALOG / PRODUCT =====
CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    parent_id   INT REFERENCES categories(id)
);
CREATE TABLE category_closure (
    ancestor_id   INT NOT NULL REFERENCES categories(id),
    descendant_id INT NOT NULL REFERENCES categories(id),
    depth         INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE TABLE brands (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE tax_categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE shipping_categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id),
    brand_id    INT REFERENCES brands(id),
    tax_category_id INT REFERENCES tax_categories(id),
    shipping_category_id INT REFERENCES shipping_categories(id),
    name        VARCHAR(200) NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    deleted_at  TIMESTAMP,   -- soft-delete 마커(broken RI informational용)
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE product_variants (
    id          SERIAL PRIMARY KEY,
    product_id  INT NOT NULL REFERENCES products(id),
    sku         VARCHAR(64) NOT NULL UNIQUE
);
CREATE TABLE option_types (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE option_values (
    id             SERIAL PRIMARY KEY,
    option_type_id INT NOT NULL REFERENCES option_types(id),
    value          VARCHAR(50) NOT NULL
);
CREATE TABLE variant_option_values (
    variant_id      INT NOT NULL REFERENCES product_variants(id),
    option_value_id INT NOT NULL REFERENCES option_values(id),
    PRIMARY KEY (variant_id, option_value_id)
);
CREATE TABLE properties (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE product_properties (
    product_id  INT NOT NULL REFERENCES products(id),
    property_id INT NOT NULL REFERENCES properties(id),
    value       VARCHAR(200),
    PRIMARY KEY (product_id, property_id)
);
CREATE TABLE product_categories (
    product_id  INT NOT NULL REFERENCES products(id),
    category_id INT NOT NULL REFERENCES categories(id),
    PRIMARY KEY (product_id, category_id)
);
CREATE TABLE prices (
    id          SERIAL PRIMARY KEY,
    variant_id  INT NOT NULL REFERENCES product_variants(id),
    currency    VARCHAR(3) NOT NULL,
    amount      NUMERIC(10,2) NOT NULL
);
CREATE TABLE product_images (
    id          SERIAL PRIMARY KEY,
    product_id  INT REFERENCES products(id),
    variant_id  INT REFERENCES product_variants(id),
    url         VARCHAR(300) NOT NULL
);

-- ===== CUSTOMER / CRM =====
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(200) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE addresses (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    state_id    INT REFERENCES states(id),
    line1       VARCHAR(200) NOT NULL,
    city        VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20)
);
CREATE TABLE customer_groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE customer_group_members (
    user_id           INT NOT NULL REFERENCES users(id),
    customer_group_id INT NOT NULL REFERENCES customer_groups(id),
    PRIMARY KEY (user_id, customer_group_id)
);
CREATE TABLE credit_cards (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    last4       VARCHAR(4) NOT NULL
);
CREATE TABLE wishlists (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    name        VARCHAR(100)
);

-- ===== PROMOTION (orders보다 먼저 — orders.coupon_id가 참조) =====
CREATE TABLE promotions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    starts_at   TIMESTAMP,
    ends_at     TIMESTAMP
);
CREATE TABLE promotion_rules (
    id           SERIAL PRIMARY KEY,
    promotion_id INT NOT NULL REFERENCES promotions(id),
    rule_type    VARCHAR(50) NOT NULL
);
CREATE TABLE promotion_actions (
    id           SERIAL PRIMARY KEY,
    promotion_id INT NOT NULL REFERENCES promotions(id),
    action_type  VARCHAR(50) NOT NULL
);
CREATE TABLE coupons (
    id           SERIAL PRIMARY KEY,
    promotion_id INT NOT NULL REFERENCES promotions(id),
    code         VARCHAR(50) NOT NULL UNIQUE
);
CREATE TABLE calculators (
    id          SERIAL PRIMARY KEY,
    strategy    VARCHAR(50) NOT NULL
);

-- ===== ORDERING / CART =====
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    shipping_address_id INT REFERENCES addresses(id),
    coupon_id   INT,   -- FK는 아래 NOT VALID로(sentinel 0 삽입 허용 + broken 스캔 대상). 85% NULL + 일부 0
    status      VARCHAR(20) NOT NULL,
    total       NUMERIC(10,2),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    product_id  INT NOT NULL,   -- FK는 아래 NOT VALID로 추가(broken RI 고아값용)
    quantity    INT NOT NULL,
    unit_price  NUMERIC(10,2) NOT NULL,
    product_name_at_purchase VARCHAR(200)   -- snapshot — 고아 라인 lineage 보존
);
CREATE TABLE carts (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id)
);
CREATE TABLE cart_items (
    id          SERIAL PRIMARY KEY,
    cart_id     INT NOT NULL REFERENCES carts(id),
    variant_id  INT NOT NULL REFERENCES product_variants(id),
    quantity    INT NOT NULL
);
CREATE TABLE adjustments (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    label       VARCHAR(100),
    amount      NUMERIC(10,2)
);
CREATE TABLE order_state_changes (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    from_state  VARCHAR(20),
    to_state    VARCHAR(20)
);
CREATE TABLE order_promotions (
    order_id     INT NOT NULL REFERENCES orders(id),
    promotion_id INT NOT NULL REFERENCES promotions(id),
    PRIMARY KEY (order_id, promotion_id)
);

-- ===== PAYMENT / BILLING =====
CREATE TABLE payment_methods (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE payments (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    payment_method_id INT REFERENCES payment_methods(id),
    amount      NUMERIC(10,2) NOT NULL,
    paid_at     TIMESTAMP
);
CREATE TABLE payment_capture_events (
    id          SERIAL PRIMARY KEY,
    payment_id  INT NOT NULL REFERENCES payments(id),
    captured_at TIMESTAMP
);
CREATE TABLE invoices (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    number      VARCHAR(50)
);
CREATE TABLE invoice_lines (
    id          SERIAL PRIMARY KEY,
    invoice_id  INT NOT NULL REFERENCES invoices(id),
    order_item_id INT REFERENCES order_items(id),
    amount      NUMERIC(10,2)
);

-- ===== SHIPPING / FULFILLMENT =====
CREATE TABLE shipping_methods (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE carriers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE stock_locations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE return_authorizations (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    reason_id   INT REFERENCES return_reasons(id),
    status      VARCHAR(20)
);
CREATE TABLE shipments (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id),
    stock_location_id INT REFERENCES stock_locations(id),
    shipping_method_id INT REFERENCES shipping_methods(id),
    carrier_id  INT REFERENCES carriers(id),
    return_id   INT REFERENCES return_authorizations(id),  -- 99% NULL(near-saturation 양성)
    tracking    VARCHAR(100)
);
CREATE TABLE zones (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE zone_members (
    id          SERIAL PRIMARY KEY,
    zone_id     INT NOT NULL REFERENCES zones(id),
    country_id  INT REFERENCES countries(id)
);
CREATE TABLE shipping_method_zones (
    shipping_method_id INT NOT NULL REFERENCES shipping_methods(id),
    zone_id            INT NOT NULL REFERENCES zones(id),
    PRIMARY KEY (shipping_method_id, zone_id)
);
CREATE TABLE shipping_method_categories (
    shipping_method_id   INT NOT NULL REFERENCES shipping_methods(id),
    shipping_category_id INT NOT NULL REFERENCES shipping_categories(id),
    PRIMARY KEY (shipping_method_id, shipping_category_id)
);

-- ===== INVENTORY / WAREHOUSE =====
CREATE TABLE inventory (
    id          SERIAL PRIMARY KEY,
    product_id  INT NOT NULL REFERENCES products(id) UNIQUE,
    quantity    INT NOT NULL
);
CREATE TABLE stock_items (
    id          SERIAL PRIMARY KEY,
    stock_location_id INT NOT NULL REFERENCES stock_locations(id),
    variant_id  INT NOT NULL REFERENCES product_variants(id),
    count_on_hand INT NOT NULL
);
CREATE TABLE stock_movements (
    id          SERIAL PRIMARY KEY,
    stock_item_id INT NOT NULL REFERENCES stock_items(id),
    quantity    INT NOT NULL
);
CREATE TABLE stock_transfers (
    id          SERIAL PRIMARY KEY,
    source_location_id INT REFERENCES stock_locations(id),
    dest_location_id   INT REFERENCES stock_locations(id)
);
CREATE TABLE warehouse_zones (
    id          SERIAL PRIMARY KEY,
    stock_location_id INT NOT NULL REFERENCES stock_locations(id),
    name        VARCHAR(50)
);
CREATE TABLE inventory_units (
    id          SERIAL PRIMARY KEY,
    variant_id  INT NOT NULL REFERENCES product_variants(id),
    shipment_id INT REFERENCES shipments(id)
);

-- ===== RETURNS / RMA =====
CREATE TABLE customer_returns (
    id          SERIAL PRIMARY KEY,
    return_authorization_id INT NOT NULL REFERENCES return_authorizations(id)
);
CREATE TABLE return_items (
    id          SERIAL PRIMARY KEY,
    return_authorization_id INT NOT NULL REFERENCES return_authorizations(id),
    inventory_unit_id INT REFERENCES inventory_units(id)
);
CREATE TABLE reimbursements (
    id          SERIAL PRIMARY KEY,
    customer_return_id INT NOT NULL REFERENCES customer_returns(id),
    amount      NUMERIC(10,2)
);
CREATE TABLE refunds (
    id          SERIAL PRIMARY KEY,
    payment_id  INT NOT NULL REFERENCES payments(id),
    return_authorization_id INT REFERENCES return_authorizations(id),
    amount      NUMERIC(10,2)
);

-- ===== TAX =====
CREATE TABLE tax_rates (
    id          SERIAL PRIMARY KEY,
    tax_category_id INT NOT NULL REFERENCES tax_categories(id),
    zone_id     INT REFERENCES zones(id),
    rate        NUMERIC(5,4) NOT NULL
);
CREATE TABLE tax_exemptions (
    id          SERIAL PRIMARY KEY,
    customer_group_id INT NOT NULL REFERENCES customer_groups(id)
);

-- ===== SUPPLIER / PROCUREMENT =====
CREATE TABLE suppliers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE purchase_orders (
    id          SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    approved_by INT,   -- 부서/직원 참조 의도이나 FK 없음(approved_by≠테이블명 → 암묵FK 미매칭, 정상)
    status      VARCHAR(20)
);
CREATE TABLE purchase_order_lines (
    id          SERIAL PRIMARY KEY,
    purchase_order_id INT NOT NULL REFERENCES purchase_orders(id),
    product_id  INT REFERENCES products(id),
    quantity    INT NOT NULL
);
CREATE TABLE goods_receipts (
    id          SERIAL PRIMARY KEY,
    purchase_order_id INT NOT NULL REFERENCES purchase_orders(id),
    received_at TIMESTAMP
);
CREATE TABLE goods_receipt_lines (
    id          SERIAL PRIMARY KEY,
    goods_receipt_id INT NOT NULL REFERENCES goods_receipts(id),
    purchase_order_line_id INT REFERENCES purchase_order_lines(id),
    quantity    INT NOT NULL
);
CREATE TABLE vendor_invoices (
    id          SERIAL PRIMARY KEY,
    purchase_order_id INT REFERENCES purchase_orders(id),
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    amount      NUMERIC(10,2)
);
CREATE TABLE supplier_products (
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    product_id  INT NOT NULL REFERENCES products(id),
    PRIMARY KEY (supplier_id, product_id)
);

-- ===== ACCOUNTING / LEDGER =====
CREATE TABLE chart_of_accounts (
    id          SERIAL PRIMARY KEY,
    parent_id   INT REFERENCES chart_of_accounts(id),
    code        VARCHAR(20) NOT NULL,
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE journals (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE journal_entries (
    id          SERIAL PRIMARY KEY,
    journal_id  INT NOT NULL REFERENCES journals(id),
    posted_at   TIMESTAMP
);
CREATE TABLE journal_entry_lines (
    id          SERIAL PRIMARY KEY,
    journal_entry_id INT NOT NULL REFERENCES journal_entries(id),
    account_id  INT NOT NULL REFERENCES chart_of_accounts(id),
    debit       NUMERIC(12,2),
    credit      NUMERIC(12,2)
);
CREATE TABLE fiscal_periods (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    starts_on   DATE,
    ends_on     DATE
);

-- ===== HR / STAFF =====
CREATE TABLE employees (
    id          SERIAL PRIMARY KEY,
    manager_id  INT REFERENCES employees(id),   -- self-FK, ~15% NULL(대조군, 임계 미달)
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE departments (
    id          SERIAL PRIMARY KEY,
    manager_id  INT REFERENCES employees(id),
    name        VARCHAR(100) NOT NULL
);
CREATE TABLE positions (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(100) NOT NULL
);
CREATE TABLE payroll_runs (
    id          SERIAL PRIMARY KEY,
    run_at      TIMESTAMP
);
CREATE TABLE payroll_entries (
    id          SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    payroll_run_id INT NOT NULL REFERENCES payroll_runs(id),
    gross       NUMERIC(10,2)
);

-- ===== AUTH / RBAC =====
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
CREATE TABLE role_users (
    user_id     INT NOT NULL REFERENCES users(id),
    role_id     INT NOT NULL REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);
CREATE TABLE permissions (
    id          SERIAL PRIMARY KEY,
    resource    VARCHAR(50) NOT NULL,
    action      VARCHAR(50) NOT NULL
);
CREATE TABLE role_permissions (
    role_id       INT NOT NULL REFERENCES roles(id),
    permission_id INT NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE api_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    token       VARCHAR(100) NOT NULL
);

-- ===== CMS / CONTENT =====
CREATE TABLE cms_pages (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(100) NOT NULL,
    title       VARCHAR(200)
);
CREATE TABLE comments (
    id              SERIAL PRIMARY KEY,
    commentable_id  INT,             -- polymorphic — commentable_type 동석 → 암묵FK 가드 발동
    commentable_type VARCHAR(50),
    body            TEXT
);
CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT,                 -- FK 없음 → users 복수형 medium 암묵FK 양성
    message     TEXT
);

-- ===== AUDIT / OPS (orphan 집결) =====
-- 메타 audit_log와 이름 충돌 회피 위해 activity_log 사용(_log denylist 입증은 동일).
CREATE TABLE activity_log (
    id          SERIAL PRIMARY KEY,
    entity_id   INT,                 -- polymorphic + *_log denylist → orphan 안 뜸
    entity_type VARCHAR(50),
    action      VARCHAR(50)
);
CREATE TABLE event_log (
    id          SERIAL PRIMARY KEY,
    payload     JSONB
);
CREATE TABLE email_log (
    id          SERIAL PRIMARY KEY,
    recipient   VARCHAR(200),
    subject     VARCHAR(200)
);
CREATE TABLE import_staging (
    id          SERIAL PRIMARY KEY,
    external_id INT,                 -- denylist → 암묵FK 무시. _staging → orphan 안 뜸
    raw_payload JSONB
);
CREATE TABLE feature_flags (
    id          SERIAL PRIMARY KEY,
    flag_key    VARCHAR(100) NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_pct INT      -- FK·*_id 매칭 컬럼 없음 → 순수 orphan 양성
);
"""

# 진단 트리거용 최소 데이터. 메타데이터 진단(orphan/implicit)은 0행이어도 작동하므로
# 데이터는 high-null·broken·soft-delete 케이스에 필요한 만큼만 넣는다.
DATA = """
-- lookup/기준 데이터 — FK 컬럼을 채워 "데이터 부족으로 인한 100% NULL" 노이즈를 막는다
-- (의도한 near-saturation 양성은 shipments.return_id 하나만 남긴다).
INSERT INTO countries (iso_code, name) VALUES ('US','USA'), ('KR','Korea');
INSERT INTO states (country_id, code, name) VALUES (1,'CA','California'), (2,'11','Seoul');
INSERT INTO return_reasons (name) VALUES ('Defective'), ('Wrong item');
INSERT INTO categories (name, parent_id) VALUES ('Root', NULL);
INSERT INTO categories (name, parent_id) VALUES ('Sub', 1);   -- parent_id 채움(100% NULL 방지)
INSERT INTO brands (name) VALUES ('Acme');
INSERT INTO tax_categories (name) VALUES ('Standard');
INSERT INTO shipping_categories (name) VALUES ('Default');
INSERT INTO shipping_methods (name) VALUES ('Ground');
INSERT INTO carriers (name) VALUES ('UPS');
INSERT INTO stock_locations (name) VALUES ('Main WH');
INSERT INTO users (email, name) VALUES ('a@x.com','A'), ('b@x.com','B'), ('c@x.com','C');
INSERT INTO addresses (user_id, state_id, line1, city) VALUES (1,1,'L1','City');  -- state_id 채움
INSERT INTO promotions (name) VALUES ('Launch');
INSERT INTO coupons (promotion_id, code) VALUES (1,'SAVE10');

-- products: 5행 중 1행 soft-delete(broken RI informational용)
INSERT INTO products (category_id, brand_id, tax_category_id, shipping_category_id, name, price, deleted_at) VALUES
    (1,1,1,1,'P1',10,NULL),
    (1,1,1,1,'P2',20,NULL),
    (2,1,1,1,'P3',30,NULL),
    (2,1,1,1,'P4',40,NULL),
    (2,1,1,1,'P5-deleted',50, NOW());   -- id=5: soft-deleted 부모

-- inventory: product_id=5(soft-deleted 부모) 참조 — 실 FK라 부모 행 존재해 통과,
-- 진단이 softDeletedParentRef(gray informational)로 잡는다(hard orphan 없는 컬럼이라 단독 노출).
INSERT INTO inventory (product_id, quantity) VALUES (1,100), (5,0);

-- orders: coupon_id 분포 — 대부분 NULL(85%), 일부 sentinel 0, 정상 1
--   coupon_id=0은 sentinel이라 broken 아니어야(음성). NULL 다수는 임계 미달(음성).
--   shipping_address_id는 채워 100% NULL 노이즈 방지.
INSERT INTO orders (user_id, shipping_address_id, status, coupon_id) VALUES
    (1,1,'complete',1),     -- 정상 쿠폰
    (1,1,'complete',0),     -- sentinel(0) → broken 아님
    (1,1,'complete',NULL),
    (2,1,'complete',NULL),
    (2,1,'complete',NULL),
    (2,1,'complete',NULL),
    (3,1,'complete',NULL),
    (3,1,'complete',NULL),
    (3,1,'complete',NULL),
    (3,1,'complete',NULL);  -- 10행 중 coupon 1개만 비-NULL/비-0 → ~85% NULL

-- order_items: broken RI 양성(고아 product_id) + soft-delete 부모 참조
--   product_id 1~4=정상, 5=soft-deleted 부모(informational), 99999=hard orphan(warning)
INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_name_at_purchase) VALUES
    (1,1,1,10,'P1'),
    (1,2,1,20,'P2'),
    (2,5,1,50,'P5-deleted'),         -- soft-deleted 부모 참조 → softDeletedParentRef
    (3,99999,1,99,'Removed SKU'),    -- hard orphan → brokenReferential
    (4,99998,1,99,'Removed SKU2');   -- hard orphan 2

-- return_authorizations: orders 뒤(order_id FK), shipments 앞(shipments.return_id가 참조). reason_id 채움.
INSERT INTO return_authorizations (order_id, reason_id, status) VALUES (1,1,'pending');

-- shipments: return_id만 99% NULL(near-saturation 양성). 다른 FK는 채워 100% NULL 노이즈 방지.
INSERT INTO shipments (order_id, stock_location_id, shipping_method_id, carrier_id, return_id, tracking)
SELECT ((g - 1) % 10) + 1, 1, 1, 1,
       CASE WHEN g = 1 THEN 1 ELSE NULL END,
       'TRK' || g
FROM generate_series(1, 100) g;

-- employees: manager self-ref ~15% NULL(대조군, 임계 미달)
INSERT INTO employees (manager_id, name)
SELECT CASE WHEN g <= 2 THEN NULL ELSE 1 END, 'E' || g
FROM generate_series(1, 20) g;

-- broken RI용 NOT VALID FK — 고아값/sentinel을 먼저 INSERT한 뒤 제약을 붙인다.
-- NOT VALID는 기존 행 검증을 건너뛰므로 99999/0이 남고, inspector는 FK로 인식 → anti-join 스캔.
-- VALIDATE는 절대 실행 안 함(고아 때문에 실패).
ALTER TABLE order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) NOT VALID;
ALTER TABLE orders
    ADD CONSTRAINT orders_coupon_id_fkey
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) NOT VALID;
"""

# pg_stats(High-NULL의 null_frac)를 채우려면 시드 후 ANALYZE 필수.
ANALYZE = "ANALYZE;"


def seed(target_engine) -> None:
    """대형 ERP 스키마(74테이블)를 대상 엔진에 시드한다.

    DROP SCHEMA public CASCADE로 깨끗이 비우고 재생성하므로 기존 테이블이 전부 사라진다.
    9테이블로 되돌리려면 seed_ecommerce.seed()를 재실행한다.
    """
    with target_engine.begin() as conn:
        conn.execute(text(DROP))
        conn.execute(text(DDL))
        conn.execute(text(DATA))
    # ANALYZE는 트랜잭션 밖에서(autocommit) 실행 — 일부 PG 설정에서 트랜잭션 내 제약 회피.
    with target_engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT").execute(text(ANALYZE))


if __name__ == "__main__":
    database_url = os.environ.get(
        "TARGET_DATABASE_URL",
        "postgresql+psycopg://sqlpreshift:sqlpreshift@localhost:5432/sqlpreshift",
    )
    seed(create_engine(database_url))
    print("ERP 시드 완료: 92 tables across 15 subdomains + diagnostic cases. ANALYZE done.")
