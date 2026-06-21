"""validation.parse + check_forbidden 단위 테스트 — TDD test-first.

구현: backend/app/pipeline/validation.py
시그니처 (ARCHITECTURE §4):
    def parse(sql: str) -> sqlglot.Expression        # 실패 시 ValidationError
    def check_forbidden(ast) -> list[Violation]      # 멀티스테이트먼트·시스템스키마 등
"""

import pytest


def _parse(sql: str):
    from app.pipeline.validation import parse  # noqa: PLC0415
    return parse(sql)


def _check(sql: str):
    from app.pipeline.validation import parse, check_forbidden  # noqa: PLC0415
    ast = parse(sql)
    return check_forbidden(ast)


def _violation_codes(violations) -> set:
    return {v.code if hasattr(v, "code") else v.rule for v in violations}


# ---------------------------------------------------------------------------
# parse 테스트
# ---------------------------------------------------------------------------

class TestParse:
    def test_valid_sql_returns_expression(self):
        """유효한 SQL → Expression 반환."""
        import sqlglot.expressions as exp
        result = _parse("SELECT 1")
        assert result is not None
        assert isinstance(result, exp.Expression)

    def test_invalid_sql_raises_validation_error(self):
        """파싱 불가 SQL → ValidationError 발생."""
        from app.pipeline.validation import ValidationError  # noqa: PLC0415
        with pytest.raises(ValidationError):
            _parse("NOT VALID SQL !!!@@@")

    def test_empty_string_raises_validation_error(self):
        """빈 문자열 → ValidationError 발생."""
        from app.pipeline.validation import ValidationError  # noqa: PLC0415
        with pytest.raises(ValidationError):
            _parse("")


# ---------------------------------------------------------------------------
# check_forbidden 테스트
# ---------------------------------------------------------------------------

class TestCheckForbidden:
    def test_multi_statement_blocked(self):
        """멀티스테이트먼트(세미콜론 분리) → Violation 반환."""
        # check_forbidden 은 단일 AST 를 받으므로, 멀티스테이트먼트 감지는
        # parse 레벨 또는 check_forbidden 에서 처리.
        # parse 가 먼저 막을 수도 있으므로 ValidationError or Violation 둘 다 허용.
        from app.pipeline.validation import parse, check_forbidden, ValidationError  # noqa: PLC0415
        try:
            ast = parse("SELECT 1; DROP TABLE users")
            violations = check_forbidden(ast)
            assert len(violations) > 0, "멀티스테이트먼트가 차단되지 않음"
        except ValidationError:
            pass  # parse 레벨에서 차단해도 OK

    def test_normal_select_no_violations(self):
        """정상 SELECT → 빈 violations."""
        violations = _check("SELECT id, name FROM users WHERE id = 1")
        assert violations == [], f"예상치 못한 violation: {violations}"

    def test_normal_alter_add_column_no_violations(self):
        """정상 ALTER ADD COLUMN → 빈 violations (check_forbidden 대상 아님)."""
        violations = _check("ALTER TABLE users ADD COLUMN age INTEGER")
        assert violations == [], f"예상치 못한 violation: {violations}"
