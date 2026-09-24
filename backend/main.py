"""
FirstPass — FastAPI Backend Entry Point
Runs on http://localhost:58765
"""

import os
import secrets
import sys
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# ── Resolve data directory ─────────────────────────────────────────────────
_firstpass_dir = Path.home() / ".firstpass"
_legacy_dir = Path.home() / ".photo-culler"
_default_dir = _firstpass_dir if _firstpass_dir.exists() else (_legacy_dir if _legacy_dir.exists() else _firstpass_dir)
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

# ── API secret (session token) ───────────────────────────────────────────
def _load_or_create_api_secret() -> str:
    env_secret = os.environ.get("FIRSTPASS_API_KEY", os.environ.get("PHOTO_CULLER_API_KEY", ""))
    if env_secret:
        return env_secret
    token_file = DATA_DIR / ".session_token"
    try:
        if token_file.exists():
            existing = token_file.read_text(encoding="utf-8").strip()
            if existing:
                return existing
    except Exception:
        pass
    generated = secrets.token_hex(32)
    try:
        token_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(token_file, 0o600)
        except Exception:
            pass
    except Exception:
        pass
    return generated


API_SECRET = _load_or_create_api_secret()

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

# ── Parent watchdog (zombie & port-lock prevention) ───────────────────────
def _start_parent_watchdog() -> None:
    """Exit if the parent Electron process dies, so no orphaned backend
    ever holds port 58765 or SQLite locks after Electron is killed/crashes."""
    import threading
    import time

    initial_ppid = os.getppid()

    def _parent_alive_unix() -> bool:
        new_ppid = os.getppid()
        return new_ppid != 1 and new_ppid == initial_ppid

    def _parent_alive_windows() -> bool:
        try:
            import psutil  # type: ignore
            return bool(psutil.pid_exists(initial_ppid))
        except ImportError:
            pass
        try:
            import ctypes
            handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, initial_ppid)
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return True  # fail-open: never kill backend on watchdog error

    def _watch() -> None:
        while True:
            time.sleep(4)
            try:
                alive = _parent_alive_windows() if sys.platform == "win32" else _parent_alive_unix()
                if not alive:
                    new_ppid = os.getppid()
                    logger.warning(
                        f"Parent process exited (PID changed to {new_ppid}). "
                        "Shutting down FirstPass backend."
                    )
                    os._exit(0)
            except Exception as e:
                logger.debug(f"Parent watchdog check failed: {e}")

    t = threading.Thread(target=_watch, daemon=True, name="parent-watchdog")
    t.start()
    logger.info(f"Parent watchdog watching PPID {initial_ppid}.")


# ── Lifespan ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FirstPass backend...")
    _start_parent_watchdog()
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
    version="1.0.1",
    description="High-performance AI-powered photo culling backend",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:58765",
    "http://127.0.0.1:58765",
    "app://-",
]
_dev_url = os.environ.get("ELECTRON_RENDERER_URL")
if _dev_url:
    from urllib.parse import urlparse as _urlparse
    _parsed = _urlparse(_dev_url)
    if _parsed.scheme and _parsed.netloc:
        _origin = f"{_parsed.scheme}://{_parsed.netloc}"
        if _origin not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _auth_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/") or path in ("/api/health", "/docs", "/openapi.json"):
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if API_SECRET:
        token = request.headers.get("X-FirstPass-Token", "")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[len("Bearer "):].strip()
            elif auth:
                token = auth.strip()
        if not token:
            token = request.query_params.get("token", "")
        if not secrets.compare_digest(token, API_SECRET):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

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
        "version": "1.0.1",
        "gpu_available": gpu_info["available"],
        "gpu_type": gpu_info["type"],
        "gpu_name": gpu_info["name"],
        "data_dir": str(DATA_DIR),
    }


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    PORT = int(os.environ.get("FIRSTPASS_PORT", os.environ.get("PHOTO_CULLER_PORT", 58765)))
    logger.info(f"Listening on port {PORT}")
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        reload=False,
    )
