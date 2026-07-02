# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
from PyInstaller.utils.hooks import collect_all
from PyInstaller.utils.hooks import copy_metadata

datas = []
binaries = []
hiddenimports = ['uvloop', 'httptools', 'websockets', 'anyio._backends._asyncio']
datas += copy_metadata('uvicorn')
datas += copy_metadata('fastapi')
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('sqlalchemy.dialects')
# sqlglot은 방언(postgres 등)을 런타임에 importlib로 동적 import한다.
# PyInstaller 정적 분석이 이를 못 잡아 sqlglot.dialects.* 가 번들에서 누락되므로
# 전체 서브모듈을 명시 수집한다 — 이게 빠지면 dialect="postgres" parse가 패키징 환경에서 죽는다.
hiddenimports += collect_submodules('sqlglot')
tmp_ret = collect_all('psycopg')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('psycopg_binary')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['watchfiles', 'alembic', 'tkinter', 'matplotlib', 'IPython'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='sqlpreshift-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='sqlpreshift-backend',
)
