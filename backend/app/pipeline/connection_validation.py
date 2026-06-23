"""런타임 target DB connection 검증 — dialect 고정·SSRF 경고·자격증명 마스킹.

설계 원칙(메모리 target-direction / positioning):
- PostgreSQL 1종 고정: dialect를 postgresql+psycopg로 강제. 다른 scheme/driver 거부.
- SSRF: 차단하지 않고 경고만(본인 로컬 PostgreSQL 연결이 정상 데모 시나리오).
- 자격증명(password)은 에러/로그에서 항상 마스킹.
- validation.py의 ValidationError 패턴을 따른다(message 속성 + 예외).
"""

from __future__ import annotations

import ipaddress
import socket
import urllib.parse

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

from app.pipeline.validation import ValidationError

# PostgreSQL 1종 고정 — 허용 driver는 이것 하나뿐
_ALLOWED_DRIVER = "postgresql+psycopg"
# 연결 테스트 timeout(초) — 포트 스캔 남용·hang 방지
_CONNECT_TIMEOUT = 5


class ConnectionValidationError(ValidationError):
    """connection string 검증 실패(URL/dialect/연결 오류). UI 노출 메시지는 영어."""


def build_url(host: str, port: int, user: str, password: str, dbname: str) -> str:
    """분리 필드를 postgresql+psycopg URL로 조립한다. password는 URL-encode.

    필수 필드 누락 시 ConnectionValidationError. password의 특수문자(@ : / % 등)는
    urllib.parse.quote로 인코딩해야 URL 파싱이 깨지지 않는다.
    """
    if not host or not user or not dbname:
        raise ConnectionValidationError("Host, user, and database name are required.")
    enc_user = urllib.parse.quote(str(user), safe="")
    enc_pw = urllib.parse.quote(str(password or ""), safe="")
    return f"{_ALLOWED_DRIVER}://{enc_user}:{enc_pw}@{host}:{port}/{dbname}"


def validate_url(url: str) -> str:
    """URL을 파싱·검증하고 정규화된 문자열을 반환한다.

    - make_url 파싱 실패 → ConnectionValidationError
    - driver가 postgresql+psycopg가 아니면 거부(Postgres 1종 고정)
    - host/database 누락 거부
    """
    try:
        parsed = make_url(url)
    except Exception:
        raise ConnectionValidationError("Invalid connection string.")

    if parsed.drivername != _ALLOWED_DRIVER:
        # mysql, postgresql+asyncpg 등 거부 — 메시지에 자격증명 노출 없음
        raise ConnectionValidationError(
            f"Only PostgreSQL with the psycopg driver is supported "
            f"(expected '{_ALLOWED_DRIVER}')."
        )
    if not parsed.host or not parsed.database:
        raise ConnectionValidationError("Connection string must include host and database.")

    return parsed.render_as_string(hide_password=False)


def internal_network_warnings(host: str) -> list[str]:
    """host가 내부망(loopback/사설망/링크로컬)이면 경고 메시지를 반환(차단 안 함).

    호스트명은 IP로 해석해 판별한다. 해석 실패 시 경고 없음(외부 도메인 가정).
    """
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        try:
            resolved = socket.gethostbyname(host)
            ip = ipaddress.ip_address(resolved)
        except Exception:
            return []

    if ip.is_loopback:
        return ["Connecting to localhost. Make sure this is the database you intend to use."]
    if ip.is_private or ip.is_link_local:
        return ["Connecting to a private network address. Make sure this host is trusted."]
    return []


def mask_url(url: str) -> str:
    """로그/에러 표시용으로 password를 마스킹한 URL을 반환."""
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<unparsable connection string>"


def test_connection(url: str) -> None:
    """SELECT 1로 실제 연결을 검증한다. 실패 시 자격증명 마스킹된 에러를 던진다.

    엔진은 테스트 후 즉시 dispose — pool을 남기지 않는다(set_target_engine과 별개).
    """
    engine = create_engine(url, connect_args={"connect_timeout": _CONNECT_TIMEOUT})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        # 에러 본문에 자격증명/내부 호스트 상세가 새지 않도록 일반화된 메시지
        raise ConnectionValidationError(
            f"Could not connect to {mask_url(url)}. Check host, port, and credentials."
        ) from e
    finally:
        engine.dispose()
