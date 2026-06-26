from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.config import settings

# 앱 메타 DB (audit_log, migration_history, schema_embeddings) — 런타임 불변.
# 사용자 target DB와 분리된 앱 소유 고정 인프라. 설치형은 SQLite 단일 파일.
# SQLite는 FastAPI 멀티스레드 접근을 위해 check_same_thread=False가 필요하다.
_meta_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
meta_engine = create_engine(settings.database_url, connect_args=_meta_connect_args)
MetaSession = sessionmaker(bind=meta_engine)


# ─── target DB holder (런타임 교체 가능) ──────────────────────────────
# 대상 DB(스키마 그래프 reflection + SQL 실행)는 런타임에 사용자가 연결한다.
# 전역 싱글톤이 아니라 holder로 감싸 set_target_engine으로 교체 가능하게 한다.
# epoch: 교체 순번 — DB가 바뀌면 프론트 dryRunStack·백엔드 token_cache 무효화 신호.
_target_holder: dict[str, object] = {"engine": None, "epoch": 0}


def _try_initial_target_engine() -> None:
    """기동 시 config의 target_database_url이 있으면 연결을 시도(lazy-init).

    실패하거나 URL이 없으면 미연결 상태(None)로 둔다 — 부팅은 항상 성공.

    설치형(frozen)은 자동 연결을 건너뛴다 — 첫 실행은 항상 온보딩 게이트에서
    사용자가 자기 DB를 연결하는 흐름이어야 하기 때문. dev/웹의 기본 target 자동연결
    편의는 그대로 보존한다(개발 환경에 Postgres가 떠 있으면 바로 메인 진입).
    """
    from app.runtime_paths import is_frozen

    if is_frozen():
        return
    url = settings.target_database_url
    if not url:
        return
    try:
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        # 실제 도달 가능 여부까지 확인(미기동 DB면 None 유지)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _target_holder["engine"] = engine
    except Exception:
        # 미연결 상태로 시작 — 온보딩에서 연결하도록 유도
        _target_holder["engine"] = None


_try_initial_target_engine()


def get_target_engine() -> Optional[Engine]:
    """현재 연결된 target engine을 반환. 미연결이면 None."""
    return _target_holder["engine"]  # type: ignore[return-value]


def is_target_connected() -> bool:
    """target DB 연결 여부."""
    return _target_holder["engine"] is not None


def get_connection_epoch() -> int:
    """DB 교체 순번. 교체 시마다 증가."""
    return _target_holder["epoch"]  # type: ignore[return-value]


def get_connection_meta() -> dict[str, object]:
    """현재 연결 메타(host/port/dbname) — password는 절대 포함하지 않는다."""
    engine: Optional[Engine] = _target_holder["engine"]  # type: ignore[assignment]
    if engine is None:
        return {"host": None, "port": None, "dbname": None}
    url = engine.url
    return {"host": url.host, "port": url.port, "dbname": url.database}


def set_target_engine(url: str) -> None:
    """검증된 connection URL로 target engine을 교체한다.

    이전 엔진은 dispose()로 pool을 정리하고, epoch을 증가시켜 캐시를 무효화한다.
    url은 호출 전에 connection_validation으로 검증된 값이어야 한다(여기선 재검증 안 함).
    """
    old: Optional[Engine] = _target_holder["engine"]  # type: ignore[assignment]
    new_engine = create_engine(url, connect_args={"connect_timeout": 5})
    _target_holder["engine"] = new_engine
    _target_holder["epoch"] = _target_holder["epoch"] + 1  # type: ignore[operator]
    # DB가 바뀌면 이전 DB 기준 분석 토큰은 모두 무효 — 캐시 비움
    _clear_token_cache()
    if old is not None:
        try:
            old.dispose()
        except Exception:
            pass


def clear_target_engine() -> None:
    """target 연결을 해제한다 — 슬롯을 비우고(None) 미연결 상태로 되돌린다.

    set_target_engine과 대칭: epoch 증가(캐시 무효화 신호) + 이전 엔진 dispose.
    온보딩 로비로 복귀시키는 Disconnect 경로에서 호출. 메타 DB는 건드리지 않는다.
    """
    old: Optional[Engine] = _target_holder["engine"]  # type: ignore[assignment]
    _target_holder["engine"] = None
    _target_holder["epoch"] = _target_holder["epoch"] + 1  # type: ignore[operator]
    _clear_token_cache()
    if old is not None:
        try:
            old.dispose()
        except Exception:
            pass


def _clear_token_cache() -> None:
    """DB 교체 시 이전 DB 기준 분석 토큰 캐시를 비운다(지연 import로 순환 회피)."""
    try:
        from app.pipeline.executor import _token_cache

        _token_cache.clear()
    except Exception:
        pass


def get_meta_session():
    session = MetaSession()
    try:
        yield session
    finally:
        session.close()


def create_meta_tables() -> None:
    """앱 메타 테이블(audit_log/migration_history/schema_embeddings)을 보장한다.

    설치형 SQLite는 pgvector 확장도 alembic도 불필요 — 3개 테이블뿐이라
    ORM 메타데이터로 create_all 하면 충분하다. 모델을 임포트해야 metadata에 등록된다.
    """
    from app.models import audit as _audit  # noqa: F401  (테이블 등록용)
    from app.models import rag as _rag  # noqa: F401

    Base.metadata.create_all(meta_engine)
