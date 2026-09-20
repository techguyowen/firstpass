# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for FirstPass Python backend
# Run from the project root:
#   pyinstaller build/photo-culler.spec

import sys
import os
from pathlib import Path

project_root = Path(SPECPATH).parent
backend_dir = project_root / "backend"
models_data_dir = backend_dir / "models_data"

block_cipher = None

# -----------------------------------------------------------------------
# Collect all data files (models, etc.)
# -----------------------------------------------------------------------
datas = [
    (str(backend_dir), "backend"),
]

# Model data files (shape predictor, BRISQUE weights, etc.)
if models_data_dir.exists():
    for f in models_data_dir.iterdir():
        if f.is_file():
            datas.append((str(f), "models_data"))

# OpenCV Haar cascades (bundled with opencv-python)
try:
    import cv2
    cv2_dir = Path(cv2.__file__).parent
    cascade_dir = cv2_dir / "data"
    if cascade_dir.exists():
        datas.append((str(cascade_dir), "cv2/data"))
except ImportError:
    pass

# pyiqa / BRISQUE model weights
try:
    import pyiqa
    pyiqa_dir = Path(pyiqa.__file__).parent
    # Include the pretrained models cache directory
    home_dir = Path.home()
    brisque_cache = home_dir / ".cache" / "pyiqa"
    if brisque_cache.exists():
        datas.append((str(brisque_cache), ".cache/pyiqa"))
    torch_hub_cache = home_dir / ".cache" / "torch" / "hub" / "pyiqa"
    if torch_hub_cache.exists():
        datas.append((str(torch_hub_cache), ".cache/torch/hub/pyiqa"))
except ImportError:
    pass

# rawpy / LibRaw shared libraries
try:
    import rawpy
    rawpy_dir = Path(rawpy.__file__).parent
    datas.append((str(rawpy_dir), "rawpy"))
except ImportError:
    pass

# -----------------------------------------------------------------------
# Hidden imports (dynamic imports that PyInstaller might miss)
# -----------------------------------------------------------------------
hiddenimports = [
    # FastAPI / Uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # Pydantic
    "pydantic.deprecated.class_validators",
    "pydantic.v1",
    # SQLAlchemy dialects
    "sqlalchemy.dialects.sqlite",
    # Image libraries
    "PIL._tkinter_finder",
    "skimage",
    # Torch
    "torch",
    "torchvision",
    # PyIQA
    "pyiqa",
    "pyiqa.archs",
    "pyiqa.archs.brisque_arch",
    # imagehash
    "imagehash",
    # rawpy
    "rawpy",
    # aiofiles
    "aiofiles",
    # send2trash
    "send2trash",
    # scipy
    "scipy.special.cython_special",
    # email-validator (fastapi optional dep)
    "email_validator",
    # multipart
    "multipart",
]

# -----------------------------------------------------------------------
# Analysis
# -----------------------------------------------------------------------
a = Analysis(
    [str(project_root / "run_backend.py")],
    pathex=[str(project_root), str(backend_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(project_root / "build" / "hooks")],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "IPython",
        "jupyter",
        "notebook",
        "pytest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="photo-culler-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="photo-culler-backend",
)
