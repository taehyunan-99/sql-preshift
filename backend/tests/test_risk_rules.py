"""risk.deterministic_rules 단위 테스트 — TDD test-first.

구현: backend/app/pipeline/risk.py
시그니처 (ARCHITECTURE §4):
    def deterministic_rules(ast, data_sim) -> list[Risk]
Risk DTO: level="critical|warning|info", rule: str, message: str
"""

import pytest
import sqlglot


# ---------------------------------------------------------------------------
# 헬퍼 — 이 테스트는 구현 import 이전에 통과 가능해야 하지만,
# TDD 계약상 구현이 존재하면 실제 import 를 쓴다.
# ---------------------------------------------------------------------------
def _ast(sql: str):
    """sqlglot 로 파싱해 AST 반환 (방언: postgres)."""
    return sqlglot.parse_one(sql, dialect="postgres")


def _rules(sql: str, data_sim=None):
    """risk.deterministic_rules 호출 래퍼."""
    from app.pipeline.risk import deterministic_rules  # noqa: PLC0415
    ast = _ast(sql)
    return deterministic_rules(ast, data_sim)


def _levels(risks) -> set:
    return {r.level for r in risks}


def _rule_ids(risks) -> set:
    return {r.rule for r in risks}


# ---------------------------------------------------------------------------
# 테스트 케이스 8개 (acceptance_criteria 기준)
# ---------------------------------------------------------------------------

class TestCriticalRules:
    """critical 위험 — 1~5번 케이스."""

    def test_delete_without_where_is_critical(self):
        """WHERE 없는 DELETE → critical."""
        risks = _rules("DELETE FROM users")
        assert any(r.level == "critical" for r in risks), f"risks={risks}"

    def test_update_without_where_is_critical(self):
        """WHERE 없는 UPDATE → critical."""
        risks = _rules("UPDATE users SET name = 'x'")
        assert any(r.level == "critical" for r in risks), f"risks={risks}"

    def test_drop_table_is_critical(self):
        """DROP TABLE → critical."""
        risks = _rules("DROP TABLE orders")
        assert any(r.level == "critical" for r in risks), f"risks={risks}"

    def test_drop_column_is_critical(self):
        """DROP COLUMN → critical."""
        risks = _rules("ALTER TABLE users DROP COLUMN email")
        assert any(r.level == "critical" for r in risks), f"risks={risks}"

    def test_truncate_is_critical(self):
        """TRUNCATE → critical."""
        risks = _rules("TRUNCATE TABLE users")
        assert any(r.level == "critical" for r in risks), f"risks={risks}"


class TestWarningRules:
    """warning 위험 — 6~7번 케이스."""

    def test_add_not_null_column_is_warning(self):
        """NOT NULL 컬럼 추가(기본값 없음) → warning."""
        risks = _rules("ALTER TABLE users ADD COLUMN age INTEGER NOT NULL")
        assert any(r.level == "warning" for r in risks), f"risks={risks}"

    def test_cascade_is_warning(self):
        """CASCADE → warning."""
        risks = _rules("DROP TABLE orders CASCADE")
        # CASCADE 는 warning, DROP TABLE 자체는 critical 도 함께 올 수 있음
        rule_ids = _rule_ids(risks)
        assert any("CASCADE" in rid.upper() for rid in rule_ids), (
            f"CASCADE rule 없음: {risks}"
        )


class TestLockingDdlRules:
    """락 유발 DDL — 운영 중 다운타임 위험(warning)."""

    def test_alter_column_type_is_warning(self):
        """ALTER COLUMN TYPE → warning (테이블 재작성 + ACCESS EXCLUSIVE 락)."""
        risks = _rules("ALTER TABLE users ALTER COLUMN age TYPE bigint")
        assert "ALTER_COLUMN_TYPE" in _rule_ids(risks), f"risks={risks}"

    def test_set_not_null_is_warning(self):
        """SET NOT NULL → warning (전체 스캔 + 락)."""
        risks = _rules("ALTER TABLE users ALTER COLUMN email SET NOT NULL")
        assert "SET_NOT_NULL" in _rule_ids(risks), f"risks={risks}"

    def test_create_index_blocking_is_warning(self):
        """CREATE INDEX(비 CONCURRENTLY) → warning (쓰기 차단)."""
        risks = _rules("CREATE INDEX idx_email ON users(email)")
        assert "CREATE_INDEX_BLOCKING" in _rule_ids(risks), f"risks={risks}"

    def test_create_index_concurrently_is_safe(self):
        """CREATE INDEX CONCURRENTLY → 위험 없음(쓰기 차단 없음)."""
        risks = _rules("CREATE INDEX CONCURRENTLY idx_email ON users(email)")
        assert "CREATE_INDEX_BLOCKING" not in _rule_ids(risks), f"risks={risks}"

    def test_add_unique_is_warning(self):
        """ADD UNIQUE → warning (인덱스 빌드 락)."""
        risks = _rules("ALTER TABLE users ADD CONSTRAINT uq UNIQUE (email)")
        assert "ADD_PK_OR_UNIQUE" in _rule_ids(risks), f"risks={risks}"

    def test_add_primary_key_is_warning(self):
        """ADD PRIMARY KEY → warning."""
        risks = _rules("ALTER TABLE users ADD PRIMARY KEY (id)")
        assert "ADD_PK_OR_UNIQUE" in _rule_ids(risks), f"risks={risks}"

    def test_add_foreign_key_is_not_locking_warning(self):
        """ADD FOREIGN KEY → 락 규칙 비대상(NOT VALID로 회피 가능, 약한 락)."""
        risks = _rules(
            "ALTER TABLE a ADD CONSTRAINT fk FOREIGN KEY (b) REFERENCES c(id)"
        )
        assert "ADD_PK_OR_UNIQUE" not in _rule_ids(risks), f"risks={risks}"


class TestDownScriptRollback:
    """build_down_script 역연산 — A-4."""

    def _down(self, sql: str) -> str:
        from app.pipeline.executor import build_down_script  # noqa: PLC0415
        return build_down_script(_ast(sql), {})

    def test_create_index_reverses_to_drop_index(self):
        assert "DROP INDEX IF EXISTS idx_email" in self._down(
            "CREATE INDEX idx_email ON users(email)"
        )

    def test_rename_table_reverses(self):
        down = self._down("ALTER TABLE users RENAME TO members")
        assert "ALTER TABLE members RENAME TO users" in down

    def test_rename_column_reverses(self):
        down = self._down("ALTER TABLE users RENAME COLUMN email TO mail")
        assert "RENAME COLUMN mail TO email" in down

    def test_named_constraint_reverses_to_drop(self):
        down = self._down("ALTER TABLE users ADD CONSTRAINT uq UNIQUE (email)")
        assert "DROP CONSTRAINT IF EXISTS uq" in down

    def test_anonymous_constraint_marked_unsupported(self):
        """익명 제약은 자동 롤백 불가 — 주석으로 표시(실행에서 제외)."""
        down = self._down("ALTER TABLE users ADD PRIMARY KEY (id)")
        assert "ROLLBACK UNSUPPORTED" in down


class TestNoRisk:
    """위험 없음 — 8번 케이스."""

    def test_select_has_no_risk(self):
        """단순 SELECT → 위험 없음."""
        risks = _rules("SELECT id, name FROM users WHERE id = 1")
        critical_or_warning = [r for r in risks if r.level in ("critical", "warning")]
        assert not critical_or_warning, f"예상치 못한 위험: {critical_or_warning}"


class TestWithWhereClause:
    """WHERE 절이 있는 DELETE/UPDATE 는 critical 아님."""

    def test_delete_with_where_is_not_critical(self):
        risks = _rules("DELETE FROM users WHERE id = 1")
        assert not any(r.level == "critical" for r in risks), (
            f"WHERE 있는 DELETE 가 critical 으로 잘못 분류: {risks}"
        )

    def test_update_with_where_is_not_critical(self):
        risks = _rules("UPDATE users SET name = 'x' WHERE id = 1")
        assert not any(r.level == "critical" for r in risks), (
            f"WHERE 있는 UPDATE 가 critical 으로 잘못 분류: {risks}"
        )
