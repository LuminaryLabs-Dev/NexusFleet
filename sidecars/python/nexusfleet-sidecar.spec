# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

root = Path(SPECPATH)
a = Analysis(
    [str(root / "nexusfleet_sidecar" / "__main__.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[],
    hiddenimports=["nexusfleet_sidecar.protocol", "nexusfleet_sidecar.operations"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="nexusfleet-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
