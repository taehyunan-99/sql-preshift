"""frozen(PyInstaller) 여부를 감지해 .env / SQLite 경로를 실행 바이너리 기준으로 고정한다.

PyInstaller _MEIPASS는 재실행마다 휘발하므로 영속 데이터(SQLite)는 거기 두지 않는다.
개발(비-frozen)에서는 전부 no-op — 기존 CWD 기준 동작을 그대로 보존한다.
"""

import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_dir() -> Path:
    # frozen: 실행 바이너리 디렉토리(영속·쓰기 가능). 개발: backend/ 루트.
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent  # app/ → backend/


def bootstrap_paths() -> None:
    """config(BaseSettings) import 이전에 호출. frozen일 때만 env로 경로를 강제 주입한다."""
    if not is_frozen():
        return
    base = app_dir()
    # 바이너리 옆 .env를 절대경로로 탐색(없으면 BaseSettings가 무시).
    os.environ.setdefault("SIDECAR_ENV_FILE", str(base / ".env"))
    # 메타 SQLite는 바이너리 옆 data/에 영속. 디렉토리 보장.
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "app_meta.db"
    # BaseSettings가 DATABASE_URL env를 database_url 필드로 흡수한다.
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
