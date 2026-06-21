"""input_router.classify_input 단위 테스트 — TDD test-first.

구현: backend/app/pipeline/input_router.py
시그니처 (ARCHITECTURE §4):
    class InputMode(str, Enum): NL = "nl"; SQL = "sql"; AUTO = "auto"
    def classify_input(text: str) -> tuple[InputMode, float]
        # sqlglot.parse_one 성공 + 첫 토큰이 SQL 키워드면 SQL, 아니면 NL
"""

import pytest


def _classify(text: str):
    from app.pipeline.input_router import classify_input  # noqa: PLC0415
    return classify_input(text)


# ---------------------------------------------------------------------------
# SQL 판별 케이스
# ---------------------------------------------------------------------------

class TestSqlClassification:
    def test_select_is_sql(self):
        """SELECT ... → SQL 판별."""
        mode, confidence = _classify("SELECT id, name FROM users WHERE id = 1")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.SQL, f"mode={mode}"
        assert confidence > 0.5

    def test_drop_table_is_sql(self):
        """DROP TABLE → SQL 판별."""
        mode, _ = _classify("DROP TABLE orders")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.SQL

    def test_alter_table_is_sql(self):
        """ALTER TABLE → SQL 판별."""
        mode, _ = _classify("ALTER TABLE users ADD COLUMN age INTEGER")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.SQL

    def test_insert_is_sql(self):
        """INSERT INTO → SQL 판별."""
        mode, _ = _classify("INSERT INTO users (name, email) VALUES ('Kim', 'k@test.com')")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.SQL

    def test_delete_is_sql(self):
        """DELETE FROM → SQL 판별."""
        mode, _ = _classify("DELETE FROM users WHERE id = 1")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.SQL


# ---------------------------------------------------------------------------
# 자연어 판별 케이스
# ---------------------------------------------------------------------------

class TestNlClassification:
    def test_korean_nl_is_nl(self):
        """한국어 자연어 → NL 판별."""
        mode, confidence = _classify("users 테이블에 나이 컬럼을 추가해줘")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.NL, f"mode={mode}"
        assert confidence > 0.5

    def test_english_nl_is_nl(self):
        """영어 자연어 → NL 판별."""
        mode, _ = _classify("Add an age column to the users table")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.NL

    def test_question_is_nl(self):
        """질문 형태 → NL 판별."""
        mode, _ = _classify("Show me all users who joined last month")
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert mode == InputMode.NL


# ---------------------------------------------------------------------------
# 반환값 계약
# ---------------------------------------------------------------------------

class TestReturnContract:
    def test_returns_tuple(self):
        """tuple[InputMode, float] 형태 반환."""
        result = _classify("SELECT 1")
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_confidence_between_0_and_1(self):
        """confidence 는 0~1 사이."""
        _, confidence = _classify("SELECT 1")
        assert 0.0 <= confidence <= 1.0

    def test_input_mode_values(self):
        """InputMode 값 확인 (NL/SQL/AUTO)."""
        from app.pipeline.input_router import InputMode  # noqa: PLC0415
        assert InputMode.NL == "nl"
        assert InputMode.SQL == "sql"
        assert InputMode.AUTO == "auto"
