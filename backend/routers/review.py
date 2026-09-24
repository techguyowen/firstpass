"""
Review router — photo listing, status updates, thumbnails, export actions.
"""

import os
import io
import shutil
import logging
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from backend.database import get_db, DATA_DIR
from backend.models.photo import Photo as PhotoModel, Settings as SettingsModel
from backend.schemas.photo import PhotoResponse, ExportRequest, TargetQuotaRequest
from backend.analyzer.delivery import calculate_target_quota, calculate_camera_alignment

logger = logging.getLogger(__name__)
router = APIRouter()

THUMBNAILS_DIR = Path(os.environ.get("FIRSTPASS_THUMBNAILS_DIR",
                                     os.environ.get("PHOTO_CULLER_THUMBNAILS_DIR",
                                                    Path(DATA_DIR) / "thumbnails")))
PREVIEWS_DIR = Path(os.environ.get("FIRSTPASS_PREVIEWS_DIR",
                                  os.environ.get("PHOTO_CULLER_PREVIEWS_DIR",
                                                 Path(DATA_DIR) / "previews")))
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

RAW_EXTENSIONS = {".cr2", ".cr3", ".nef", ".arw", ".orf", ".raf", ".dng", ".rw2"}

from collections import OrderedDict
import threading

_thumb_cache_lock = threading.Lock()
_thumb_cache: "OrderedDict[int, bytes]" = OrderedDict()
MAX_THUMB_CACHE_SIZE = 600

def _get_cached_thumbnail(photo_id: int):
    with _thumb_cache_lock:
        if photo_id in _thumb_cache:
            _thumb_cache.move_to_end(photo_id)
            return _thumb_cache[photo_id]
    return None

def _put_cached_thumbnail(photo_id: int, data: bytes):
    with _thumb_cache_lock:
        _thumb_cache[photo_id] = data
        if len(_thumb_cache) > MAX_THUMB_CACHE_SIZE:
            _thumb_cache.popitem(last=False)


# ── Photos list ─────────────────────────────────────────────────────────────

@router.get("/photos", response_model=dict)
def get_photos(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=10000),
    status: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    has_faces: Optional[bool] = None,
    is_blurry: Optional[bool] = None,
    exposure_type: Optional[str] = None,
    duplicate_only: Optional[bool] = None,
    burst_only: Optional[bool] = None,
    is_burst_leader: Optional[bool] = None,
    scene_id: Optional[str] = None,
    is_smiling: Optional[bool] = None,
    is_bokeh: Optional[bool] = None,
    has_closed_eyes: Optional[bool] = None,
    is_detail_shot: Optional[bool] = None,
    is_motion_intentional: Optional[bool] = None,
    shoot_genre: Optional[str] = None,
    search: Optional[str] = None,
    folder: Optional[str] = None,
    is_raw: Optional[bool] = None,
    min_face_count: Optional[int] = None,
    max_face_count: Optional[int] = None,
    is_tagged: Optional[bool] = None,
    sort_by: str = Query("overall_score_desc"),
    db: Session = Depends(get_db),
):
    query = db.query(PhotoModel)

    if search:
        s_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                PhotoModel.filename.ilike(s_term),
                PhotoModel.camera_model.ilike(s_term),
                PhotoModel.lens_model.ilike(s_term),
                PhotoModel.scene_name.ilike(s_term),
                PhotoModel.folder.ilike(s_term),
            )
        )
    if folder:
        query = query.filter(
            or_(PhotoModel.folder == folder, PhotoModel.folder.startswith(folder + os.sep))
        )
    if status:
        query = query.filter(PhotoModel.status == status)
    if is_tagged is not None:
        query = query.filter(PhotoModel.is_tagged == is_tagged)
    if min_score is not None:
        query = query.filter(PhotoModel.overall_score >= min_score)
    if max_score is not None:
        query = query.filter(PhotoModel.overall_score <= max_score)
    if has_faces is not None:
        if has_faces:
            query = query.filter(PhotoModel.face_count > 0)
        else:
            query = query.filter(or_(PhotoModel.face_count == 0, PhotoModel.face_count.is_(None)))
    if has_closed_eyes is not None:
        query = query.filter(PhotoModel.has_closed_eyes == has_closed_eyes)
    if min_face_count is not None:
        query = query.filter(PhotoModel.face_count >= min_face_count)
    if max_face_count is not None:
        query = query.filter(PhotoModel.face_count <= max_face_count)
    if is_blurry is not None:
        query = query.filter(PhotoModel.is_blurry == is_blurry)
    if is_bokeh is not None:
        query = query.filter(PhotoModel.is_bokeh == is_bokeh)
    if exposure_type:
        query = query.filter(PhotoModel.exposure_type == exposure_type)
    if duplicate_only:
        query = query.filter(PhotoModel.duplicate_group_id.isnot(None))
    if burst_only:
        query = query.filter(PhotoModel.burst_group_id.isnot(None))
    if is_burst_leader is not None:
        query = query.filter(PhotoModel.is_burst_leader == is_burst_leader)
    if scene_id:
        query = query.filter(PhotoModel.scene_id == scene_id)
    if is_smiling is not None:
        if is_smiling:
            query = query.filter(PhotoModel.smile_score > 30.0)
        else:
            query = query.filter(or_(PhotoModel.smile_score == None, PhotoModel.smile_score <= 30.0))
    if is_raw is not None:
        query = query.filter(PhotoModel.is_raw == is_raw)
    if is_detail_shot is not None:
        query = query.filter(PhotoModel.is_detail_shot == is_detail_shot)
    if is_motion_intentional is not None:
        query = query.filter(PhotoModel.is_motion_intentional == is_motion_intentional)
    if shoot_genre:
        query = query.filter(PhotoModel.shoot_genre == shoot_genre)

    # Sorting
    sort_map = {
        "overall_score_desc": PhotoModel.overall_score.desc().nullslast(),
        "overall_score_asc": PhotoModel.overall_score.asc().nullsfirst(),
        "date_desc": PhotoModel.exif_date.desc().nullslast(),
        "date_asc": PhotoModel.exif_date.asc().nullsfirst(),
        "filename_asc": PhotoModel.filename.asc(),
        "filename_desc": PhotoModel.filename.desc(),
        "blur_score_asc": PhotoModel.blur_score.asc().nullsfirst(),
        "created_desc": PhotoModel.created_at.desc(),
    }
    order_col = sort_map.get(sort_by, PhotoModel.overall_score.desc().nullslast())
    query = query.order_by(order_col)

    total = query.count()
    photos = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "photos": [_photo_to_dict(p) for p in photos],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/photos/{photo_id}")
def get_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return _photo_to_dict(photo)


@router.put("/photos/{photo_id}/status")
def update_photo_status(photo_id: int, body: dict, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    new_status = body.get("status")
    if new_status not in ("pending", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status value")

    old_status = photo.status
    photo.status = new_status

    # Preference learning adaptation:
    # When user overrides AI suggestions, gently adjust biases
    settings = db.query(SettingsModel).first()
    if settings and photo.overall_score is not None:
        if new_status == "accepted" and old_status != "accepted":
            if photo.overall_score < settings.auto_accept_threshold:
                settings.learned_accept_bias = max(-20.0, (settings.learned_accept_bias or 0.0) - 0.2)
            if photo.is_blurry:
                settings.learned_blur_bias = max(-20.0, (settings.learned_blur_bias or 0.0) - 0.3)
        elif new_status == "rejected" and old_status != "rejected":
            if photo.overall_score >= settings.min_overall_score:
                settings.learned_accept_bias = min(20.0, (settings.learned_accept_bias or 0.0) + 0.2)
                settings.learned_blur_bias = min(20.0, (settings.learned_blur_bias or 0.0) + 0.2)

    db.commit()
    db.refresh(photo)
    return _photo_to_dict(photo)


@router.put("/photos/{photo_id}/tag")
def toggle_photo_tag(photo_id: int, body: Optional[dict] = None, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if body and "is_tagged" in body:
        photo.is_tagged = bool(body["is_tagged"])
    else:
        photo.is_tagged = not bool(photo.is_tagged)
    db.commit()
    db.refresh(photo)
    return _photo_to_dict(photo)


# ── Thumbnails & full images ─────────────────────────────────────────────────

@router.get("/photos/{photo_id}/thumbnail")
def get_thumbnail(photo_id: int, db: Session = Depends(get_db)):
    # 1. Ultra-fast in-memory cache check (<1ms)
    cached = _get_cached_thumbnail(photo_id)
    if cached:
        return Response(
            content=cached,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "ETag": f'"{photo_id}-m"',
            },
        )

    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    thumb_path = THUMBNAILS_DIR / f"{photo_id}.jpg"
    if thumb_path.exists():
        try:
            with open(thumb_path, "rb") as f:
                data = f.read()
            _put_cached_thumbnail(photo_id, data)
            return Response(
                content=data,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "ETag": f'"{photo_id}-{int(thumb_path.stat().st_mtime)}"',
                },
            )
        except Exception:
            return FileResponse(str(thumb_path), media_type="image/jpeg",
                                headers={"Cache-Control": "public, max-age=31536000, immutable"})

    # 2. Fast on-demand generation directly from file (RAW embedded preview or Pillow draft decode)
    try:
        from backend.analyzer.pipeline import fast_generate_thumbnail_from_path
        settings = db.query(SettingsModel).first()
        size = settings.thumbnail_size if settings else 300
        thumb_path_str = fast_generate_thumbnail_from_path(photo.path, photo_id, size, str(THUMBNAILS_DIR))
        if thumb_path_str and os.path.exists(thumb_path_str):
            with open(thumb_path_str, "rb") as f:
                data = f.read()
            _put_cached_thumbnail(photo_id, data)
            return Response(
                content=data,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "ETag": f'"{photo_id}-g"',
                },
            )
    except Exception as e:
        logger.warning(f"Could not fast-generate thumbnail for {photo_id}: {e}")

    raise HTTPException(status_code=500, detail="Thumbnail generation failed")


@router.get("/photos/{photo_id}/full")
def get_full_image(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    path = Path(photo.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    if path.suffix.lower() in RAW_EXTENSIONS:
        # Check disk cache for preview first (ultra-fast <1ms SSD hit)
        preview_path = PREVIEWS_DIR / f"{photo_id}.jpg"
        if preview_path.exists():
            return FileResponse(
                str(preview_path),
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=86400, immutable"},
            )

        # Convert RAW to JPEG or extract high-res embedded preview
        try:
            import rawpy
            import cv2
            with rawpy.imread(str(path)) as raw:
                # 1. Try camera-embedded full/high-res JPEG preview (~2ms extraction)
                try:
                    thumb = raw.extract_thumb()
                    if thumb.format == rawpy.ThumbFormat.JPEG:
                        preview_path.write_bytes(thumb.data)
                        return FileResponse(
                            str(preview_path),
                            media_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=86400, immutable"},
                        )
                except Exception:
                    pass

                # 2. Fast demosaic fallback
                rgb = raw.postprocess(use_camera_wb=True, half_size=True, no_auto_bright=False)
            img_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            success, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if success:
                preview_path.write_bytes(buf.tobytes())
                return FileResponse(
                    str(preview_path),
                    media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400, immutable"},
                )
        except Exception as e:
            logger.warning(f"RAW conversion failed for {photo_id}: {e}")
            raise HTTPException(status_code=500, detail="RAW conversion failed")
    else:
        # Serve directly with caching
        media_type_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".tif": "image/tiff",
            ".tiff": "image/tiff", ".webp": "image/webp",
            ".heic": "image/heic",
        }
        media_type = media_type_map.get(path.suffix.lower(), "image/jpeg")
        return FileResponse(
            str(path),
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=86400, immutable"},
        )


# ── Face Loupe ───────────────────────────────────────────────────────────────

@router.get("/photos/{photo_id}/faces")
def get_photo_faces(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    import json
    from ..models.photo import VipFace

    # Look up any saved VIP face records for this photo
    vips = db.query(VipFace).filter(VipFace.photo_id == photo_id).all()
    vip_map = {v.face_index: v.id for v in vips}

    faces = []
    if photo.detected_faces_json:
        try:
            raw_faces = json.loads(photo.detected_faces_json)
            for idx, f in enumerate(raw_faces):
                vip_id = vip_map.get(idx)
                is_vip = (vip_id is not None) or bool(f.get("is_vip", False))
                faces.append({
                    "index": idx,
                    "box": f.get("box", []),
                    "has_closed_eyes": f.get("has_closed_eyes", False),
                    "is_smiling": f.get("is_smiling", False),
                    "smile_score": f.get("smile_score", 0.0),
                    "sharpness": f.get("sharpness", 0.0),
                    "is_vip": is_vip,
                    "vip_id": vip_id,
                    "url": f"/api/photos/{photo_id}/face/{idx}"
                })
        except Exception:
            pass
    return {"faces": faces, "total": len(faces)}


@router.get("/photos/{photo_id}/face/{face_index}")
def get_face_crop(photo_id: int, face_index: int, db: Session = Depends(get_db)):
    photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
    if not photo or not photo.detected_faces_json:
        raise HTTPException(status_code=404, detail="Face data not found")
    import json
    import cv2
    from backend.analyzer.pipeline import load_image
    try:
        faces = json.loads(photo.detected_faces_json)
        if face_index < 0 or face_index >= len(faces):
            raise HTTPException(status_code=404, detail="Face index out of range")
        box = faces[face_index].get("box")
        if not box or len(box) != 4:
            raise HTTPException(status_code=400, detail="Invalid face coordinates")
        
        img, _ = load_image(photo.path)
        if img is None:
            raise HTTPException(status_code=500, detail="Could not load image")
        
        ih, iw = img.shape[:2]
        x, y, w, h = box
        
        # Calculate face center
        cx = x + w / 2.0
        cy = y + h / 2.0
        
        # 1:1 Square bounding box (1.5x face dimension for context)
        side = max(w, h) * 1.5
        x1 = int(cx - side / 2.0)
        y1 = int(cy - side / 2.0)
        x2 = int(cx + side / 2.0)
        y2 = int(cy + side / 2.0)
        
        # Keep square aspect ratio within image bounds
        if x1 < 0:
            x2 = min(iw, int(x2 - x1))
            x1 = 0
        if y1 < 0:
            y2 = min(ih, int(y2 - y1))
            y1 = 0
        if x2 > iw:
            x1 = max(0, int(x1 - (x2 - iw)))
            x2 = iw
        if y2 > ih:
            y1 = max(0, int(y1 - (y2 - ih)))
            y2 = ih
            
        crop = img[y1:y2, x1:x2]
        success, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise HTTPException(status_code=500, detail="Could not encode face crop")
        return Response(
            content=buf.tobytes(), 
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving face crop {photo_id}/{face_index}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Duplicates ────────────────────────────────────────────────────────────────

@router.get("/duplicates")
def get_duplicate_groups(db: Session = Depends(get_db)):
    photos_with_groups = (
        db.query(PhotoModel)
        .filter(PhotoModel.duplicate_group_id != None)
        .order_by(PhotoModel.duplicate_group_id, PhotoModel.overall_score.desc().nullslast())
        .all()
    )

    groups: dict = {}
    for p in photos_with_groups:
        gid = p.duplicate_group_id
        if gid not in groups:
            groups[gid] = []
        groups[gid].append(_photo_to_dict(p))

    return [{"group_id": gid, "photos": photos} for gid, photos in groups.items()]


# ── Export ─────────────────────────────────────────────────────────────────────

@router.post("/export")
def export_photos(req: ExportRequest, db: Session = Depends(get_db)):
    if req.action not in ("move", "copy", "trash", "mark_only", "xmp"):
        raise HTTPException(status_code=400, detail="Invalid action")

    photos = db.query(PhotoModel).filter(PhotoModel.id.in_(req.photo_ids)).all()
    if not photos:
        raise HTTPException(status_code=400, detail="No photos found")

    if req.action == "mark_only":
        return {"success": True, "count": len(photos), "message": "Photos marked as rejected."}

    if req.action == "xmp":
        count = 0
        errors = []
        for p in photos:
            try:
                src = Path(p.path)
                if not src.exists():
                    errors.append(f"{p.filename} not found")
                    continue

                if p.status == "accepted":
                    rating = 5
                    label = "Green"
                elif p.status == "rejected":
                    rating = 1
                    label = "Red"
                else:
                    rating = 0
                    label = ""

                xmp_content = f"""<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="FirstPass XMP Core 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:Rating>{rating}</xmp:Rating>
   <xmp:Label>{label}</xmp:Label>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
"""
                sidecar1 = src.parent / f"{src.stem}.xmp"
                sidecar2 = src.parent / f"{src.name}.xmp"
                sidecar1.write_text(xmp_content, encoding="utf-8")
                if sidecar1 != sidecar2:
                    sidecar2.write_text(xmp_content, encoding="utf-8")
                count += 1
            except Exception as e:
                errors.append(str(e))

        msg = f"Created industry-standard XMP sidecars for {count} photo(s)."
        if errors:
            msg += f" ({len(errors)} errors)"
        return {"success": True, "count": count, "message": msg}

    if req.action == "trash":
        try:
            import send2trash
            count = 0
            errors = []
            for p in photos:
                try:
                    send2trash.send2trash(p.path)
                    db.delete(p)
                    count += 1
                except Exception as e:
                    errors.append(str(e))
            db.commit()
            msg = f"Moved {count} photo(s) to trash."
            if errors:
                msg += f" {len(errors)} error(s)."
            return {"success": True, "count": count, "message": msg}
        except ImportError:
            raise HTTPException(status_code=500, detail="send2trash not available")

    if req.action in ("move", "copy"):
        if not req.destination_folder:
            raise HTTPException(status_code=400, detail="destination_folder is required")
        dest = Path(req.destination_folder)
        dest.mkdir(parents=True, exist_ok=True)
        count = 0
        errors = []
        for p in photos:
            src = Path(p.path)
            if not src.exists():
                errors.append(f"{p.filename} not found")
                continue
            dst = dest / src.name
            # Avoid overwriting by appending counter
            counter = 1
            while dst.exists():
                dst = dest / f"{src.stem}_{counter}{src.suffix}"
                counter += 1
            try:
                if req.action == "move":
                    try:
                        shutil.move(str(src), str(dst))
                        if not dst.exists():
                            raise IOError(f"Moved file missing at destination {dst}")
                        p.path = str(dst)
                        p.folder = str(dst.parent)
                        db.commit()
                        count += 1
                    except Exception as e:
                        db.rollback()
                        # Rollback file move if src missing and dst exists
                        if not src.exists() and dst.exists():
                            try:
                                shutil.move(str(dst), str(src))
                            except Exception as rollback_err:
                                logger.error(f"Failed to rollback file move {dst} -> {src}: {rollback_err}")
                        errors.append(f"{p.filename}: {e}")
                else:
                    shutil.copy2(str(src), str(dst))
                    count += 1
            except Exception as e:
                errors.append(str(e))
        db.commit()
        verb = "Moved" if req.action == "move" else "Copied"
        msg = f"{verb} {count} photo(s) to {dest}."
        if errors:
            msg += f" {len(errors)} error(s)."
        return {"success": True, "count": count, "message": msg}


# ── Folders Management ─────────────────────────────────────────────────────────

@router.get("/folders")
def get_folders(db: Session = Depends(get_db)):
    """Return distinct folder paths with photo counts."""
    results = (
        db.query(PhotoModel.folder, func.count(PhotoModel.id))
        .filter(PhotoModel.folder.isnot(None))
        .group_by(PhotoModel.folder)
        .order_by(PhotoModel.folder.asc())
        .all()
    )
    folders = []
    for f_path, count in results:
        if not f_path:
            continue
        folders.append({
            "path": f_path,
            "name": os.path.basename(f_path) or f_path,
            "count": count
        })
    return {"folders": folders, "total_folders": len(folders)}


@router.delete("/folders")
def remove_folder(
    folder: str = Query(..., description="Folder path to remove from library"),
    db: Session = Depends(get_db)
):
    """Remove all photos belonging to a folder from the database (keeps files safe on disk)."""
    deleted = db.query(PhotoModel).filter(
        or_(PhotoModel.folder == folder, PhotoModel.folder.startswith(folder + os.sep))
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "deleted": deleted, "folder": folder}


# ── Delivery & Multi-Camera Constraints ─────────────────────────────────────────

@router.post("/cull/target-quota")
def apply_target_quota(req: TargetQuotaRequest, db: Session = Depends(get_db)):
    """
    Applies 'Magic Number' delivery target. Selects the top N images
    distributed proportionally across all detected scenes.
    """
    query = db.query(PhotoModel)
    if req.folder:
        query = query.filter(or_(PhotoModel.folder == req.folder, PhotoModel.folder.startswith(req.folder + os.sep)))
    photos = query.all()
    if not photos:
        raise HTTPException(status_code=400, detail="No photos found to cull.")

    result = calculate_target_quota(photos, req.target_count, req.preserve_story_arc)

    acc_ids = set(result["accepted_ids"])
    for p in photos:
        if p.id in acc_ids:
            p.status = "accepted"
        else:
            p.status = "rejected"
    db.commit()

    return {
        "success": True,
        "target_requested": req.target_count,
        "accepted_count": len(acc_ids),
        "rejected_count": len(result["rejected_ids"]),
        "scene_breakdown": result["scene_breakdown"],
        "message": f"Applied target quota: {len(acc_ids)} photos accepted across {len(result['scene_breakdown'])} scenes."
    }


@router.post("/cull/align-cameras")
def align_cameras(folder: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Calculates multi-camera clock drift across camera bodies and syncs the timeline.
    """
    query = db.query(PhotoModel)
    if folder:
        query = query.filter(or_(PhotoModel.folder == folder, PhotoModel.folder.startswith(folder + os.sep)))
    photos = query.all()
    if not photos:
        raise HTTPException(status_code=400, detail="No photos found.")

    res = calculate_camera_alignment(photos)
    offsets = res.get("offsets_applied", {})

    for p in photos:
        cam = getattr(p, 'camera_model', None)
        if cam in offsets:
            p.camera_clock_offset = offsets[cam]

    db.commit()
    return res


# ── Duplicates — Auto-pick ────────────────────────────────────────────────────

@router.post("/duplicates/auto-pick")
def auto_pick_best_duplicates(db: Session = Depends(get_db)):
    """
    For each duplicate group, accept the photo with the highest overall_score
    and reject all others in the group.
    """
    # Get all photos that are in a duplicate group
    dupes = db.query(PhotoModel).filter(PhotoModel.duplicate_group_id.isnot(None)).all()

    # Group by duplicate_group_id
    groups: dict = {}
    for p in dupes:
        groups.setdefault(p.duplicate_group_id, []).append(p)

    accepted_count = 0
    rejected_count = 0

    for group_id, photos in groups.items():
        if len(photos) < 2:
            continue
        # Pick best by overall_score (None scores treated as 0)
        best = max(photos, key=lambda p: p.overall_score or 0.0)
        for p in photos:
            if p.id == best.id:
                p.status = "accepted"
                accepted_count += 1
            else:
                p.status = "rejected"
                rejected_count += 1

    db.commit()
    return {
        "success": True,
        "groups_processed": len(groups),
        "accepted": accepted_count,
        "rejected": rejected_count,
    }


# ── VIP Faces ────────────────────────────────────────────────────────────────

@router.get("/vip-faces")
def get_vip_faces(db: Session = Depends(get_db)):
    from ..models.photo import VipFace
    vips = db.query(VipFace).order_by(VipFace.created_at.desc()).all()
    return {"vip_faces": [
        {
            "id": v.id,
            "photo_id": v.photo_id,
            "face_index": v.face_index,
            "label": v.label,
            "thumbnail_b64": v.thumbnail_b64,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in vips
    ]}


@router.post("/vip-faces")
def add_vip_face(body: dict, db: Session = Depends(get_db)):
    from ..models.photo import VipFace
    import json
    import cv2
    import base64
    photo_id = body.get("photo_id")
    face_index = body.get("face_index", 0)
    label = body.get("label", "VIP")

    if not photo_id:
        raise HTTPException(status_code=400, detail="photo_id required")

    # Check for duplicate
    existing = db.query(VipFace).filter(
        VipFace.photo_id == photo_id,
        VipFace.face_index == face_index
    ).first()
    if existing:
        existing.label = label
        db.commit()
        db.refresh(existing)
        return {
            "id": existing.id,
            "photo_id": existing.photo_id,
            "face_index": existing.face_index,
            "label": existing.label,
            "thumbnail_b64": existing.thumbnail_b64,
            "created_at": existing.created_at.isoformat() if existing.created_at else None,
        }

    # Generate 128x128 face crop thumbnail as base64
    thumbnail_b64 = None
    try:
        photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
        if photo and photo.detected_faces_json:
            faces = json.loads(photo.detected_faces_json)
            if 0 <= face_index < len(faces):
                box = faces[face_index].get("box", [])
                if len(box) == 4:
                    from backend.analyzer.pipeline import load_image
                    img, _ = load_image(photo.path)
                    if img is not None:
                        ih, iw = img.shape[:2]
                        x, y, w, h = box
                        cx, cy = x + w / 2, y + h / 2
                        side = int(max(w, h) * 1.5)
                        x1 = max(0, int(cx - side / 2))
                        y1 = max(0, int(cy - side / 2))
                        x2 = min(iw, int(cx + side / 2))
                        y2 = min(ih, int(cy + side / 2))
                        crop = img[y1:y2, x1:x2]
                        crop_resized = cv2.resize(crop, (128, 128))
                        _, buf = cv2.imencode('.jpg', crop_resized, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        thumbnail_b64 = base64.b64encode(buf.tobytes()).decode('utf-8')
    except Exception as e:
        logger.warning(f"Could not generate VIP face thumbnail: {e}")

    # Update detected_faces_json on photo model
    try:
        photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
        if photo and photo.detected_faces_json:
            faces_data = json.loads(photo.detected_faces_json)
            if 0 <= face_index < len(faces_data):
                faces_data[face_index]["is_vip"] = True
                photo.detected_faces_json = json.dumps(faces_data)
                db.commit()
    except Exception:
        pass

    vip = VipFace(
        photo_id=photo_id,
        face_index=face_index,
        label=label,
        thumbnail_b64=thumbnail_b64,
    )
    db.add(vip)
    db.commit()
    db.refresh(vip)
    return {
        "id": vip.id,
        "photo_id": vip.photo_id,
        "face_index": vip.face_index,
        "label": vip.label,
        "thumbnail_b64": vip.thumbnail_b64,
        "created_at": vip.created_at.isoformat() if vip.created_at else None,
    }


@router.delete("/vip-faces/{vip_id}")
def remove_vip_face(vip_id: int, db: Session = Depends(get_db)):
    from ..models.photo import VipFace
    import json
    vip = db.query(VipFace).filter(VipFace.id == vip_id).first()
    if not vip:
        raise HTTPException(status_code=404, detail="VIP face not found")
    
    # Sync with detected_faces_json
    try:
        photo = db.query(PhotoModel).filter(PhotoModel.id == vip.photo_id).first()
        if photo and photo.detected_faces_json:
            faces_data = json.loads(photo.detected_faces_json)
            if 0 <= vip.face_index < len(faces_data):
                faces_data[vip.face_index]["is_vip"] = False
                photo.detected_faces_json = json.dumps(faces_data)
    except Exception:
        pass

    db.delete(vip)
    db.commit()
    return {"success": True, "deleted_id": vip_id}


@router.delete("/vip-faces/by-photo/{photo_id}/{face_index}")
def remove_vip_face_by_photo(photo_id: int, face_index: int, db: Session = Depends(get_db)):
    from ..models.photo import VipFace
    import json
    vips = db.query(VipFace).filter(
        VipFace.photo_id == photo_id,
        VipFace.face_index == face_index
    ).all()
    for v in vips:
        db.delete(v)

    # Sync with detected_faces_json
    try:
        photo = db.query(PhotoModel).filter(PhotoModel.id == photo_id).first()
        if photo and photo.detected_faces_json:
            faces_data = json.loads(photo.detected_faces_json)
            if 0 <= face_index < len(faces_data):
                faces_data[face_index]["is_vip"] = False
                photo.detected_faces_json = json.dumps(faces_data)
    except Exception:
        pass

    db.commit()
    return {"success": True, "photo_id": photo_id, "face_index": face_index}


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _photo_to_dict(p: PhotoModel) -> dict:
    return {
        "id": p.id,
        "path": p.path,
        "filename": p.filename,
        "folder": p.folder,
        "file_size": p.file_size,
        "width": p.width,
        "height": p.height,
        "exif_date": p.exif_date,
        "is_raw": p.is_raw,
        "raw_format": p.raw_format,
        "blur_score": p.blur_score,
        "is_blurry": p.is_blurry,
        "is_bokeh": p.is_bokeh,
        "exposure_score": p.exposure_score,
        "exposure_type": p.exposure_type,
        "face_count": p.face_count,
        "has_closed_eyes": p.has_closed_eyes,
        "smile_score": p.smile_score,
        "group_consistency_score": p.group_consistency_score,
        "detected_faces_json": p.detected_faces_json,
        "camera_make": p.camera_make,
        "camera_model": p.camera_model,
        "lens_model": p.lens_model,
        "shutter_speed": p.shutter_speed,
        "aperture": p.aperture,
        "iso": p.iso,
        "focal_length": p.focal_length,
        "aesthetic_score": p.aesthetic_score,
        "composition_score": p.composition_score,
        "overall_score": p.overall_score,
        "duplicate_group_id": p.duplicate_group_id,
        "burst_group_id": p.burst_group_id,
        "is_burst_leader": p.is_burst_leader,
        "scene_id": p.scene_id,
        "scene_name": p.scene_name,
        "shoot_genre": getattr(p, "shoot_genre", "general"),
        "is_detail_shot": getattr(p, "is_detail_shot", False),
        "is_motion_intentional": getattr(p, "is_motion_intentional", False),
        "lighting_type": getattr(p, "lighting_type", "standard"),
        "is_vip_focused": bool(getattr(p, "is_vip_focused", False)),
        "reasons_json": getattr(p, "reasons_json", None),
        "camera_clock_offset": getattr(p, "camera_clock_offset", 0.0),
        "status": p.status,
        "is_tagged": bool(getattr(p, "is_tagged", False)),
        "is_analyzed": p.is_analyzed,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "analyzed_at": p.analyzed_at.isoformat() if p.analyzed_at else None,
    }
