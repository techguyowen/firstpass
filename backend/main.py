"""
FirstPass — FastAPI Backend Entry Point
Runs on http://localhost:58765
"""

import os
import sys
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ── Resolve data directory ─────────────────────────────────────────────────
_legacy_dir = Path.home() / ".photo-culler"
_default_dir = _legacy_dir if _legacy_dir.exists() else Path.home() / ".firstpass"
DATA_DIR = Path(os.environ.get("FIRSTPASS_DATA_DIR", os.environ.get("PHOTO_CULLER_DATA_DIR", str(_default_dir))))
DATA_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "photos.db"

os.environ.setdefault("FIRSTPASS_DATA_DIR", str(DATA_DIR))
os.environ.setdefault("PHOTO_CULLER_DATA_DIR", str(DATA_DIR))
os.environ.setdefault("FIRSTPASS_DB_PATH", str(DB_PATH))
os.environ.setdefault("PHOTO_CULLER_DB_PATH", str(DB_PATH))
os.environ.setdefault("FIRSTPASS_THUMBNAILS_DIR", str(THUMBNAILS_DIR))
os.environ.setdefault("PHOTO_CULLER_THUMBNAILS_DIR", str(THUMBNAILS_DIR))

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(DATA_DIR / "firstpass.log"),
    ],
)
logger = logging.getLogger("firstpass")

# ── Setup import paths for standalone / PyInstaller ────────────────────────
_backend_dir = Path(__file__).resolve().parent
_project_root = _backend_dir.parent
for _p in [str(_project_root), str(_backend_dir)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

if "backend" not in sys.modules:
    import types
    _pkg = types.ModuleType("backend")
    _pkg.__path__ = [str(_backend_dir)]
    sys.modules["backend"] = _pkg

# ── Database + models ──────────────────────────────────────────────────────
from backend.database import engine, Base, auto_migrate
from backend.models import photo as _photo_models  # noqa: F401 — register models

# ── Routers ────────────────────────────────────────────────────────────────
from backend.routers import scan, analyze, review, settings as settings_router, updater

# ── GPU detection ──────────────────────────────────────────────────────────
from backend.analyzer.gpu import get_gpu_info

# ── Lifespan ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FirstPass backend...")
    logger.info(f"Data directory: {DATA_DIR}")
    logger.info(f"Database:       {DB_PATH}")
    logger.info(f"Thumbnails:     {THUMBNAILS_DIR}")

    # Create all DB tables & auto-migrate any existing databases
    Base.metadata.create_all(bind=engine)
    auto_migrate(engine)
    logger.info("Database tables and migrations ready.")

    # Detect GPU
    gpu_info = get_gpu_info()
    app.state.gpu_info = gpu_info
    if gpu_info["available"]:
        logger.info(f"GPU detected: {gpu_info['type']} — {gpu_info['name']}")
    else:
        logger.info("No GPU detected — running on CPU.")

    # Ensure default settings row exists
    from backend.database import SessionLocal
    from backend.models.photo import Settings as SettingsModel
    db = SessionLocal()
    try:
        if not db.query(SettingsModel).first():
            db.add(SettingsModel())
            db.commit()
            logger.info("Created default settings.")
    finally:
        db.close()

    yield

    logger.info("FirstPass backend shutting down.")


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="FirstPass API",
    version="1.0.0",
    description="High-performance AI-powered photo culling backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scan.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(updater.router, prefix="/api")


@app.get("/api/health")
async def health():
    gpu_info = getattr(app.state, "gpu_info", {"available": False, "type": "cpu", "name": "CPU"})
    return {
        "status": "ok",
        "version": "1.0.0",
        "gpu_available": gpu_info["available"],
        "gpu_type": gpu_info["type"],
        "gpu_name": gpu_info["name"],
        "data_dir": str(DATA_DIR),
    }


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    PORT = int(os.environ.get("PHOTO_CULLER_PORT", 58765))
    logger.info(f"Listening on port {PORT}")
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        reload=False,
    )
