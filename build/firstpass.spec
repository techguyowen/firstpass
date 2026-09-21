# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for FirstPass Python backend
# Run from the project root:
#   pyinstaller build/firstpass.spec

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
# Hidden imports (dependencies that PyInstaller might miss)
# -----------------------------------------------------------------------
hiddenimports = [
    # FastAPI / Uvicorn
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "pydantic",
    "pydantic_settings",
    "starlette",
    # Database
    "sqlalchemy",
    "sqlalchemy.dialects.sqlite",
    # Image processing
    "PIL",
    "PIL.Image",
    "PIL.ExifTags",
    "cv2",
    "numpy",
    "scipy",
    "scipy.ndimage",
    "imagehash",
    "rawpy",
    # PyTorch
    "torch",
    "torchvision",
    "torchvision.transforms",
    # pyiqa
    "pyiqa",
    "pyiqa.models",
    "pyiqa.archs",
    # Other utilities
    "aiofiles",
    "send2trash",
    "tqdm",
    # Backend modules
    "backend.main",
    "backend.database",
    "backend.models.photo",
    "backend.schemas.photo",
    "backend.analyzer.pipeline",
    "backend.analyzer.blur",
    "backend.analyzer.exposure",
    "backend.analyzer.faces",
    "backend.analyzer.duplicates",
    "backend.analyzer.aesthetic",
    "backend.analyzer.composition",
    "backend.analyzer.gpu",
    "backend.routers.scan",
    "backend.routers.analyze",
    "backend.routers.review",
    "backend.routers.settings",
    "backend.routers.export",
    "backend.routers.target_delivery",
    "backend.routers.updater",
]

# Optional dlib (may not be installed in all environments)
try:
    import dlib
    hiddenimports.append("dlib")
except ImportError:
    pass

# -----------------------------------------------------------------------
# Analysis
# -----------------------------------------------------------------------
a = Analysis(
    [str(backend_dir / "main.py")],
    pathex=[str(project_root), str(backend_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude large, unused modules to keep binary size down
        "tkinter",
        "matplotlib",
        "notebook",
        "IPython",
        "pytest",
        "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="firstpass-backend",
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
    name="firstpass-backend",
)
