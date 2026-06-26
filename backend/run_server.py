"""PyInstaller sidecar 진입점. uvicorn을 프로그래매틱으로 기동한다(CLI 문자열 import 회피).

데스크톱 Electron이 이 바이너리를 spawn하고, stdout의 SQLPRESHIFT_PORT=n 을 파싱해
백엔드 포트를 알아낸다. SIDECAR_PORT를 지정하면 고정 포트(디버깅), 미지정이면 빈 포트 자동 배정.
"""

import multiprocessing
import os
import socket


def _resolve_port() -> int:
    requested = int(os.environ.get("SIDECAR_PORT", "0"))
    if requested != 0:
        return requested
    # OS가 빈 포트를 배정 — 포트 충돌을 구조적으로 제거한다.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    multiprocessing.freeze_support()  # frozen spawn 안전장치 — 반드시 최상단

    from app.runtime_paths import bootstrap_paths

    bootstrap_paths()  # config import 전에 frozen 경로 주입

    import uvicorn

    from app.main import app

    port = _resolve_port()
    print(f"SQLPRESHIFT_PORT={port}", flush=True)  # Electron이 stdout 파싱

    # reload/workers>1 금지: frozen에서 reloader/spawn이 붕괴한다. sidecar는 로컬 전용.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        workers=1,
        access_log=False,
    )


if __name__ == "__main__":
    main()
