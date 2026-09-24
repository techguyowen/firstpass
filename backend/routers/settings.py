"""
Settings router — get/update app settings, reset library.
"""

import logging
import os
import platform
import re
import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db, DATA_DIR
from backend.models.photo import Settings as SettingsModel, Photo as PhotoModel
from backend.schemas.photo import SettingsUpdate

logger = logging.getLogger(__name__)
router = APIRouter()

GITHUB_REPO_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$")


def validate_github_repo(value) -> None:
    if value is None:
        return
    if not isinstance(value, str) or not GITHUB_REPO_PATTERN.match(value):
        raise HTTPException(status_code=400, detail="Invalid github_repo format. Must be 'owner/repo'")


def _settings_to_dict(s: SettingsModel) -> dict:
    return {
        "blur_threshold": s.blur_threshold,
        "exposure_low_threshold": s.exposure_low_threshold,
        "exposure_high_threshold": s.exposure_high_threshold,
        "duplicate_hash_distance": s.duplicate_hash_distance,
        "min_overall_score": s.min_overall_score,
        "auto_accept_threshold": s.auto_accept_threshold,
        "thumbnail_size": s.thumbnail_size,
        "gpu_enabled": s.gpu_enabled,
        "weight_blur": s.weight_blur,
        "weight_exposure": s.weight_exposure,
        "weight_aesthetic": s.weight_aesthetic,
        "weight_composition": s.weight_composition,
        "burst_time_threshold": s.burst_time_threshold,
        "scene_gap_threshold": s.scene_gap_threshold,
        "github_repo": s.github_repo,
        "enable_blink_detection": s.enable_blink_detection,
        "enable_smile_detection": s.enable_smile_detection,
        "enable_group_consistency": s.enable_group_consistency,
        "enable_bokeh_detection": s.enable_bokeh_detection,
        "enable_camera_shake": s.enable_camera_shake,
        "enable_burst_grouping": s.enable_burst_grouping,
        "enable_scene_chapters": s.enable_scene_chapters,
        "enable_preference_learning": s.enable_preference_learning,
        "enable_explainable_ai": s.enable_explainable_ai,
        "enable_genre_awareness": s.enable_genre_awareness,
        "active_shoot_genre": s.active_shoot_genre,
        "target_delivery_count": s.target_delivery_count,
        "learned_blur_bias": s.learned_blur_bias,
        "learned_accept_bias": s.learned_accept_bias,
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(SettingsModel).first()
    if not settings:
        settings = SettingsModel()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return _settings_to_dict(settings)


@router.put("/settings")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    data = body.model_dump()
    if "github_repo" in data and data["github_repo"] is not None:
        validate_github_repo(data["github_repo"])
    settings = db.query(SettingsModel).first()
    if not settings:
        settings = SettingsModel()
        db.add(settings)

    for field, value in data.items():
        if hasattr(settings, field):
            setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    logger.info("Settings updated.")
    return _settings_to_dict(settings)


@router.post("/settings/reset-learning")
def reset_learning(db: Session = Depends(get_db)):
    """Reset personalized preference learning biases back to zero."""
    settings = db.query(SettingsModel).first()
    if settings:
        settings.learned_blur_bias = 0.0
        settings.learned_accept_bias = 0.0
        db.commit()
        db.refresh(settings)
    return {"success": True, "message": "Learned preference biases reset to 0."}


@router.get("/system/info")
def get_system_info(db: Session = Depends(get_db)):
    """Support diagnostics: app/OS/Python/GPU versions, log path, DB size, photo count."""
    try:
        from backend.routers.updater import CURRENT_VERSION as app_version
    except Exception:
        app_version = "1.0.1"

    try:
        from backend.analyzer.gpu import get_gpu_info
        gpu_info = get_gpu_info()
    except Exception as e:
        logger.warning(f"GPU info unavailable for diagnostics: {e}")
        gpu_info = {"available": False, "type": "cpu", "name": "CPU"}

    data_dir = Path(str(DATA_DIR))
    log_path = data_dir / "firstpass.log"
    db_path = Path(os.environ.get(
        "FIRSTPASS_DB_PATH",
        os.environ.get("PHOTO_CULLER_DB_PATH", str(data_dir / "photos.db")),
    ))
    try:
        database_size_bytes = db_path.stat().st_size if db_path.exists() else 0
    except Exception:
        database_size_bytes = 0
    try:
        total_photos = db.query(PhotoModel).count()
    except Exception:
        total_photos = 0

    return {
        "app_version": app_version,
        "platform": platform.platform(),
        "os_system": platform.system(),
        "os_release": platform.release(),
        "machine": platform.machine(),
        "python_version": sys.version.split()[0],
        "gpu_available": bool(gpu_info.get("available")),
        "gpu_type": gpu_info.get("type", "cpu"),
        "gpu_name": gpu_info.get("name", "CPU"),
        "log_path": str(log_path),
        "data_dir": str(data_dir),
        "database_path": str(db_path),
        "database_size_bytes": database_size_bytes,
        "database_size_mb": round(database_size_bytes / (1024 * 1024), 2),
        "total_photos": total_photos,
    }


@router.delete("/reset")
def reset_library(db: Session = Depends(get_db)):
    """Delete all photo records. Settings are preserved."""
    count = db.query(PhotoModel).count()
    db.query(PhotoModel).delete()
    db.commit()
    logger.info(f"Library reset: {count} photo records deleted.")
    return {"success": True, "deleted": count, "message": f"Library cleared ({count} photos removed)."}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Return library statistics for the dashboard."""
    from sqlalchemy import func as sa_func
    total = db.query(PhotoModel).count()
    analyzed = db.query(PhotoModel).filter(PhotoModel.is_analyzed == True).count()
    accepted = db.query(PhotoModel).filter(PhotoModel.status == "accepted").count()
    rejected = db.query(PhotoModel).filter(PhotoModel.status == "rejected").count()
    pending = db.query(PhotoModel).filter(PhotoModel.status == "pending").count()
    blurry = db.query(PhotoModel).filter(PhotoModel.is_blurry == True).count()
    duplicates = (
        db.query(PhotoModel)
        .filter(PhotoModel.duplicate_group_id != None)
        .count()
    )

    by_reason = {
        "blurry": db.query(PhotoModel).filter(PhotoModel.is_blurry == True).count(),
        "underexposed": db.query(PhotoModel).filter(PhotoModel.exposure_type == 'underexposed').count(),
        "overexposed": db.query(PhotoModel).filter(PhotoModel.exposure_type == 'overexposed').count(),
        "closed_eyes": db.query(PhotoModel).filter(PhotoModel.has_closed_eyes == True).count(),
        "duplicates": db.query(PhotoModel).filter(PhotoModel.duplicate_group_id.isnot(None)).count(),
        "has_faces": db.query(PhotoModel).filter(PhotoModel.face_count > 0).count(),
        "solo": db.query(PhotoModel).filter(PhotoModel.face_count == 1).count(),
        "pairs": db.query(PhotoModel).filter(PhotoModel.face_count == 2).count(),
        "groups": db.query(PhotoModel).filter(PhotoModel.face_count >= 3).count(),
    }

    # Date range from exif_date (stored as string — lexicographic min/max works for ISO-8601)
    date_row = db.query(
        sa_func.min(PhotoModel.exif_date),
        sa_func.max(PhotoModel.exif_date),
    ).first()
    date_range = {
        "earliest": date_row[0] if date_row else None,
        "latest": date_row[1] if date_row else None,
    }

    # Most common camera model
    top_camera_row = (
        db.query(PhotoModel.camera_model, sa_func.count(PhotoModel.id).label("cnt"))
        .filter(PhotoModel.camera_model.isnot(None))
        .group_by(PhotoModel.camera_model)
        .order_by(sa_func.count(PhotoModel.id).desc())
        .first()
    )
    top_camera = top_camera_row[0] if top_camera_row else None

    return {
        "total": total,
        "analyzed": analyzed,
        "accepted": accepted,
        "rejected": rejected,
        "pending": pending,
        "blurry": blurry,
        "duplicates": duplicates,
        "by_reason": by_reason,
        "date_range": date_range,
        "top_camera": top_camera,
    }
