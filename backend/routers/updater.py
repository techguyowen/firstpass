"""
Updater router — checks GitHub releases for updates, downloads, and installs in place.
"""

import os
import sys
import json
import logging
import platform
import subprocess
import urllib.request
import threading
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.photo import Settings as SettingsModel

logger = logging.getLogger(__name__)
router = APIRouter()

_firstpass_dir = Path.home() / ".firstpass"
_legacy_dir = Path.home() / ".photo-culler"
_default_dir = _firstpass_dir if _firstpass_dir.exists() else (_legacy_dir if _legacy_dir.exists() else _firstpass_dir)
UPDATES_DIR = Path(os.environ.get("FIRSTPASS_DATA_DIR", os.environ.get("PHOTO_CULLER_DATA_DIR", str(_default_dir)))) / "updates"

# In-memory download state
_download_state = {
    "status": "idle", # idle, downloading, completed, error
    "downloaded_bytes": 0,
    "total_bytes": 0,
    "percent": 0.0,
    "file_path": None,
    "error_message": None
}
_download_lock = threading.Lock()

def _parse_semver(version_str: str) -> tuple:
    clean = version_str.lstrip("vV").split("-")[0].strip()
    parts = []
    for p in clean.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])

def _is_newer(latest: str, current: str) -> bool:
    try:
        return _parse_semver(latest) > _parse_semver(current)
    except Exception:
        return False

@router.get("/updater/check")
def check_for_updates(db: Session = Depends(get_db)):
    settings = db.query(SettingsModel).first()
    repo = settings.github_repo if settings and settings.github_repo else "techguyowen/firstpass"
    
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(url, headers={
        "User-Agent": "FirstPass-App",
        "Accept": "application/vnd.github.v3+json"
    })
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {
                "has_update": False,
                "current_version": CURRENT_VERSION,
                "latest_version": CURRENT_VERSION,
                "message": f"No releases found for repository {repo}."
            }
        logger.warning(f"Failed to check updates from GitHub ({e.code}): {e}")
        return {
            "has_update": False,
            "current_version": CURRENT_VERSION,
            "latest_version": CURRENT_VERSION,
            "message": f"GitHub returned status {e.code}"
        }
    except Exception as e:
        logger.warning(f"Network error checking updates: {e}")
        return {
            "has_update": False,
            "current_version": CURRENT_VERSION,
            "latest_version": CURRENT_VERSION,
            "message": f"Could not connect to GitHub: {str(e)}"
        }

    tag_name = data.get("tag_name", "")
    release_name = data.get("name") or tag_name
    body = data.get("body", "")
    published_at = data.get("published_at", "")
    
    has_update = _is_newer(tag_name, CURRENT_VERSION)
    
    # Identify appropriate asset for current OS & architecture
    assets = data.get("assets", [])
    system_os = platform.system().lower() # darwin, windows, linux
    system_arch = platform.machine().lower() # arm64, x86_64, amd64
    
    matched_asset = None
    if "darwin" in system_os:
        # Match .dmg, preferring architecture if present
        dmg_assets = [a for a in assets if a.get("name", "").endswith(".dmg")]
        for a in dmg_assets:
            if "arm64" in system_arch and "arm64" in a.get("name", "").lower():
                matched_asset = a
                break
            elif "x86" in system_arch and "x64" in a.get("name", "").lower():
                matched_asset = a
                break
        if not matched_asset and dmg_assets:
            matched_asset = dmg_assets[0]
    elif "windows" in system_os:
        exe_assets = [a for a in assets if a.get("name", "").endswith(".exe")]
        if exe_assets:
            matched_asset = exe_assets[0]
    elif "linux" in system_os:
        linux_assets = [a for a in assets if a.get("name", "").endswith(".AppImage") or a.get("name", "").endswith(".deb")]
        if linux_assets:
            matched_asset = linux_assets[0]

    download_url = matched_asset.get("browser_download_url") if matched_asset else None
    asset_name = matched_asset.get("name") if matched_asset else None
    asset_size = matched_asset.get("size") if matched_asset else None

    return {
        "has_update": has_update,
        "current_version": CURRENT_VERSION,
        "latest_version": tag_name.lstrip("vV"),
        "release_name": release_name,
        "release_notes": body,
        "download_url": download_url,
        "asset_name": asset_name,
        "asset_size": asset_size,
        "published_at": published_at
    }

def _download_worker(download_url: str, output_path: Path):
    global _download_state
    try:
        req = urllib.request.Request(download_url, headers={"User-Agent": "FirstPass-App"})
        with urllib.request.urlopen(req, timeout=30) as response:
            total_size = int(response.headers.get("content-length", 0))
            with _download_lock:
                _download_state["total_bytes"] = total_size
                _download_state["downloaded_bytes"] = 0
                _download_state["status"] = "downloading"
                _download_state["file_path"] = str(output_path)
            
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "wb") as f:
                downloaded = 0
                chunk_size = 1024 * 128 # 128 KB
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    with _download_lock:
                        _download_state["downloaded_bytes"] = downloaded
                        if total_size > 0:
                            _download_state["percent"] = round((downloaded / total_size) * 100, 1)

        with _download_lock:
            _download_state["status"] = "completed"
            _download_state["percent"] = 100.0
    except Exception as e:
        logger.error(f"Update download failed: {e}")
        with _download_lock:
            _download_state["status"] = "error"
            _download_state["error_message"] = str(e)

@router.post("/updater/download")
def start_download_update(body: dict):
    download_url = body.get("download_url")
    asset_name = body.get("asset_name") or "FirstPass-Update"
    if not download_url:
        raise HTTPException(status_code=400, detail="Missing download_url")
        
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    target_file = UPDATES_DIR / asset_name
    
    with _download_lock:
        if _download_state["status"] == "downloading":
            return {"message": "Download already in progress"}
        _download_state["status"] = "downloading"
        _download_state["downloaded_bytes"] = 0
        _download_state["total_bytes"] = 0
        _download_state["percent"] = 0.0
        _download_state["file_path"] = str(target_file)
        _download_state["error_message"] = None
        
    t = threading.Thread(target=_download_worker, args=(download_url, target_file), daemon=True)
    t.start()
    
    return {"message": "Download started", "target": str(target_file)}

@router.get("/updater/progress")
def get_download_progress():
    with _download_lock:
        return dict(_download_state)

@router.post("/updater/install")
def install_update():
    with _download_lock:
        file_path = _download_state.get("file_path")
        status = _download_state.get("status")
        
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="No downloaded update found on disk")
        
    system = platform.system().lower()
    try:
        if "darwin" in system:
            # Mount DMG and open Finder
            logger.info(f"Opening macOS installer DMG: {file_path}")
            subprocess.Popen(["open", str(file_path)])
            return {"success": True, "message": "Installer launched. Please complete installation."}
        elif "windows" in system:
            logger.info(f"Launching Windows installer: {file_path}")
            os.startfile(file_path)
            return {"success": True, "message": "Installer launched. Please complete installation."}
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(file_path)])
            return {"success": True, "message": "Installer opened."}
    except Exception as e:
        logger.error(f"Failed to launch installer: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to launch installer: {str(e)}")
