# 무결성 진단 테스트 시나리오

> 시드 e커머스 DB(users/orders/products/...)는 FK 완비라 진단이 **안 뜨는 게 정상**.
> 진단을 보려면 결함 케이스를 target DB에 만들어야 한다. 아래는 "셋업 → 화면 입력 → 기대 결과" 순서.
>
> - 셋업/정리 SQL은 **psql로 직접** 실행(앱 외부, target DB). 진단 자체는 read-only.
> - 화면 입력은 **앱 입력창**(NL 또는 SQL). 진단은 입력이 닿는 테이블의 n홉 부분집합에 표시.
> - 모든 셋업 테이블은 `diagtest_` 접두 → 마지막에 한 번에 정리.

---

## 0. psql 접속 (셋업/정리용)

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

---

## 시나리오 A — Orphan Tables (고립 테이블)

**검증 포인트**: 일반 고립 테이블은 dim+"ISOLATED" 표시 / `_log`·`_audit` 등 denylist는 표시 안 됨.

### A-1 셋업 (psql)
```sql
-- 일반 고립 테이블(FK 없음) → ISOLATED 떠야 함
CREATE TABLE diagtest_widget (id int PRIMARY KEY, name varchar(50));
-- denylist 테이블(suffix) → ISOLATED 안 떠야 함
CREATE TABLE diagtest_event_log (id int PRIMARY KEY, payload text);
CREATE TABLE diagtest_sales_staging (id int PRIMARY KEY, amount numeric);
```

### A-2 화면 입력
- SQL: `ALTER TABLE diagtest_widget ADD COLUMN note text;`
- 자연어(동등): `add a note column to diagtest_widget`
- (event_log 보려면) SQL: `ALTER TABLE diagtest_event_log ADD COLUMN level int;`

### A-3 기대 결과
- `diagtest_widget` 카드: 흐릿(opacity 0.6) + 헤더에 gray **"ISOLATED"** 배지
- `diagtest_event_log` / `diagtest_sales_staging`: **배지 없음**(denylist), 정상 밝기
- diff 색(추가 컬럼)과 ISOLATED gray가 안 섞이는지 확인

---

## 시나리오 B — Implicit FK (암묵 외래키, 점선 엣지)

**검증 포인트**: FK 제약 없는 `*_id`에 점선 추정 엣지 / surrogate id·멀티테넌시는 표시 안 됨 / confidence 톤 차등.

### B-1 셋업 (psql)
```sql
-- 부모(매치 대상)
CREATE TABLE diagtest_member (id int PRIMARY KEY, name varchar(50));
CREATE TABLE diagtest_account (id int PRIMARY KEY);
-- 자식: 여러 *_id 컬럼(FK 제약 전부 없음)
CREATE TABLE diagtest_post (
  id int PRIMARY KEY,
  member_id int,        -- 암묵 FK → diagtest_member (high, 단수 직접매칭)
  external_id int,      -- denylist → 표시 안 됨
  session_id int,       -- denylist → 표시 안 됨
  tenant_id int         -- 멀티테넌시 suppress → 표시 안 됨
);
-- polymorphic: commentable_id + commentable_type → 추정 엣지 금지
CREATE TABLE diagtest_comment (
  id int PRIMARY KEY,
  commentable_id int,
  commentable_type varchar(30)
);
```

### B-2 화면 입력
- SQL: `ALTER TABLE diagtest_post ADD COLUMN body text;`
- 자연어(동등): `add a body text column to diagtest_post`

### B-3 기대 결과
- `diagtest_post.member_id`: **점선 엣지**(`diagtest_member`로) + 옅은 회색 FK 아이콘. hover 시 "Estimated FK → ... (inferred from naming)"
- `external_id` / `session_id` / `tenant_id`: **점선 없음**(denylist/suppress)
- `diagtest_comment.commentable_id`: **점선 없음**(polymorphic 가드)
- (참고) medium 신뢰도 톤 차이를 보려면 `users_id` 같은 복수형 매칭 컬럼이 필요 — 위 케이스는 전부 high

---

## 시나리오 C — High-NULL FK (거의 안 쓰이는 FK)

**검증 포인트**: near-saturation(≥98%) NULL만 중립 "Rarely populated" / 0.2~0.97은 표시 안 됨(임계 상향 효과).

### C-1 셋업 (psql)
```sql
CREATE TABLE diagtest_m (id int PRIMARY KEY);
-- member_id: 99% NULL (암묵 FK → diagtest_m? base=m 매치 안됨. 'm' 테이블명이라 매치)
-- 정확 매칭 위해 부모 테이블명을 base와 일치시킴
CREATE TABLE diagtest_p2 (
  id int PRIMARY KEY,
  m_id int        -- 암묵 FK → diagtest_m? base='m', 'diagtest_m' 전체매치 아님
);
-- ※ 암묵 FK는 테이블명 전체 매칭이라 prefix가 방해됨. 아래는 prefix 없는 케이스로:
DROP TABLE diagtest_p2;
CREATE TABLE member (id int PRIMARY KEY);
CREATE TABLE post2 (
  id int PRIMARY KEY,
  member_id int   -- 암묵 FK → member (단수 직접), high-null 대상
);
-- 99% NULL 데이터 + 통계 갱신
INSERT INTO post2(id, member_id) SELECT g, CASE WHEN g=1 THEN 1 ELSE NULL END FROM generate_series(1,100) g;
ANALYZE post2;
```

### C-2 화면 입력
- SQL: `ALTER TABLE post2 ADD COLUMN title text;`
- 자연어(동등): `add a title column to post2`

### C-3 기대 결과
- `post2.member_id`: 타입 칩 옆 중립색(회색) **"Rarely populated"** 힌트 + 점선 엣지(암묵 FK). hover 시 "estimated from last ANALYZE"
- amber(경고색)가 **아님**을 확인 — 정상 optional FK를 병리화하지 않음
- (대조) 50% NULL이면 표시 안 됨 — `member_id`를 50% NULL로 바꿔 재확인 가능

---

## 시나리오 D — Broken Referential Integrity (고아 값 / soft-delete)

**검증 포인트**: 실제 FK에 고아 값 → 빨간 경고삼각 / soft-delete 부모 참조 → 회색 점(informational) / sentinel(0) 제외.

### D-1 셋업 (psql)
```sql
CREATE TABLE diagtest_parent (id int PRIMARY KEY, deleted_at timestamp);
INSERT INTO diagtest_parent(id, deleted_at) VALUES (1, NULL), (2, now());  -- 1=살아있음, 2=soft-deleted
CREATE TABLE diagtest_child (id int PRIMARY KEY, parent_id int);
INSERT INTO diagtest_child VALUES (1,1), (2,2), (3,0), (4,777);  -- 0=sentinel, 777=고아값
-- NOT VALID FK: 기존 고아 값 검증 건너뛰고 제약만 등록(inspector가 FK로 인식)
ALTER TABLE diagtest_child ADD CONSTRAINT diagtest_child_fk
  FOREIGN KEY (parent_id) REFERENCES diagtest_parent(id) NOT VALID;
```

### D-2 화면 입력
- SQL: `ALTER TABLE diagtest_child ADD COLUMN memo text;`
- 자연어(동등): `add a memo column to diagtest_child`

### D-3 기대 결과
- `diagtest_child.parent_id`: 컬럼명 뒤 **빨간 경고삼각**(777=고아값 → brokenReferential). hover "Some values reference a missing parent row"
- 0(sentinel)·NULL은 고아로 안 침
- (soft-only 케이스 분리 확인) 777 행 삭제 후 재입력하면 → 빨간삼각 사라지고 **회색 점**(2=soft-deleted 부모 참조 → informational)
  ```sql
  DELETE FROM diagtest_child WHERE id = 4;  -- 고아값 제거
  ```

---

## 시나리오 E — 회귀(기존 기능 유지)

**검증 포인트**: 진단 추가가 기존 diff/n홉/Split를 안 깨뜨림.

### E-1 화면 입력(시드 테이블, 깨끗한 DB)
- SQL: `ALTER TABLE orders ADD COLUMN tracking_no varchar(40);`
- 자연어(동등): `add a tracking number column to orders`

### E-2 기대 결과
- `orders` + FK 이웃(users/addresses/order_items/payments)만 n홉 부분집합으로 표시
- 추가 컬럼 diff 색(초록) 정상, **진단 표시 없음**(시드는 깨끗)
- Split/Unified 토글, pan/zoom 동기화, "Showing X of Y" 카운터 정상
- Apply All 누적 흐름 정상

---

## 정리 (테스트 끝나고 — psql)

```sql
DROP TABLE IF EXISTS
  diagtest_widget, diagtest_event_log, diagtest_sales_staging,
  diagtest_member, diagtest_account, diagtest_post, diagtest_comment,
  diagtest_parent, diagtest_child,
  post2, member
  CASCADE;
```

---

## 한눈에 보는 입력 순서 (자연어)

1. `add a note column to diagtest_widget` → ISOLATED 배지(일반 고립)
2. `add a level column to diagtest_event_log` → 배지 없음(denylist)
3. `add a body text column to diagtest_post` → member_id만 점선, external/session/tenant 없음
4. `add a title column to post2` → member_id에 "Rarely populated"(중립)
5. `add a memo column to diagtest_child` → parent_id에 빨간 경고삼각(고아값)
6. `add a tracking number column to orders` → 회귀(진단 없음, diff/n홉 정상)

> 자연어가 의도대로 SQL로 안 풀리면(Ollama 분류 흔들림) 위 SQL을 직접 입력.
> Safari 실기기에서 점선 엣지·경고삼각·gray 점·dim 카드가 흐림/깜빡임 없는지 확인.
