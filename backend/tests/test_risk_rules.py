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
