from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import uuid
import os
import concurrent.futures
from datetime import datetime

from ..database import get_db, SessionLocal, DATA_DIR
from ..models.photo import Photo, Settings
from ..schemas.photo import JobStatus, AnalyzeRequest
from ..jobs import jobs, jobs_lock
from ..analyzer.pipeline import analyze_photo_sync
from ..analyzer.duplicates import detect_burst_groups, detect_scenes

router = APIRouter()

def analyze_worker(job_id: str, photo_ids: list[int] = None, force_reanalyze: bool = False):
    try:
        db = SessionLocal()
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            
        thumbnails_dir = os.path.join(DATA_DIR, "thumbnails")
        os.makedirs(thumbnails_dir, exist_ok=True)
        
        settings_dict = {
            "blur_threshold": settings.blur_threshold,
            "exposure_low_threshold": settings.exposure_low_threshold,
            "exposure_high_threshold": settings.exposure_high_threshold,
            "auto_accept_threshold": settings.auto_accept_threshold,
            "min_overall_score": settings.min_overall_score,
            "thumbnail_size": settings.thumbnail_size,
            "weight_blur": settings.weight_blur,
            "weight_exposure": settings.weight_exposure,
            "weight_aesthetic": settings.weight_aesthetic,
            "weight_composition": settings.weight_composition,
            "enable_blink_detection": settings.enable_blink_detection,
            "enable_smile_detection": settings.enable_smile_detection,
            "enable_group_consistency": settings.enable_group_consistency,
            "enable_bokeh_detection": settings.enable_bokeh_detection,
            "enable_camera_shake": settings.enable_camera_shake,
            "enable_burst_grouping": settings.enable_burst_grouping,
            "enable_scene_chapters": settings.enable_scene_chapters,
            "enable_preference_learning": settings.enable_preference_learning,
            "enable_explainable_ai": settings.enable_explainable_ai,
            "enable_genre_awareness": settings.enable_genre_awareness,
            "active_shoot_genre": settings.active_shoot_genre,
            "target_delivery_count": settings.target_delivery_count,
            "learned_blur_bias": settings.learned_blur_bias,
            "learned_accept_bias": settings.learned_accept_bias,
            "burst_time_threshold": settings.burst_time_threshold,
            "duplicate_hash_distance": settings.duplicate_hash_distance,
        }

        if force_reanalyze:
            query = db.query(Photo)
            if photo_ids:
                query = query.filter(Photo.id.in_(photo_ids))
        elif photo_ids:
            query = db.query(Photo).filter(Photo.id.in_(photo_ids))
        else:
            query = db.query(Photo).filter(Photo.is_analyzed == False)
            
        photos_to_analyze = query.all()
        total = len(photos_to_analyze)
        
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].status = "running"
                jobs[job_id].total = total
                jobs[job_id].message = f"Analyzing {total} photos..."
                
        num_workers = min(max(2, (os.cpu_count() or 4) - 1), 8)
        photo_items = [(p.id, p.path) for p in photos_to_analyze]
        completed_count = 0

        def _process_one(item):
            pid, ppath = item
            return pid, analyze_photo_sync(pid, ppath, thumbnails_dir, settings_dict)

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            future_to_item = {executor.submit(_process_one, item): item for item in photo_items}
            for future in concurrent.futures.as_completed(future_to_item):
                try:
                    pid, res = future.result()
                    if res.get("success"):
                        photo = db.query(Photo).filter(Photo.id == pid).first()
                        if photo:
                            photo.is_analyzed = True
                            photo.analyzed_at = datetime.utcnow()

                            # Update scores
                            photo.blur_score = res["blur"].get("blur_score")
                            photo.is_blurry = res["blur"].get("is_blurry")
                            photo.is_bokeh = res.get("is_bokeh", False)

                            photo.exposure_score = res["exposure"].get("exposure_score")
                            photo.exposure_type = res["exposure"].get("exposure_type")

                            photo.face_count = res["faces"].get("face_count")
                            photo.has_closed_eyes = res["faces"].get("has_closed_eyes")
                            photo.smile_score = res.get("smile_score", 0.0)
                            photo.group_consistency_score = res.get("group_consistency_score")
                            photo.detected_faces_json = res.get("detected_faces_json")

                            photo.aesthetic_score = res["aesthetic"].get("aesthetic_score")
                            photo.composition_score = res["composition"].get("composition_score")
                            photo.overall_score = res["overall_score"]
                            photo.status = res["status"]

                            # Advanced Genre & Artistic Attributes
                            photo.shoot_genre = res.get("shoot_genre", "general")
                            photo.is_detail_shot = res.get("is_detail_shot", False)
                            photo.is_motion_intentional = res.get("is_motion_intentional", False)
                            photo.lighting_type = res.get("lighting_type", "standard")
                            photo.is_vip_focused = res.get("is_vip_focused", False)
                            photo.reasons_json = res.get("reasons_json")

                            # EXIF details
                            exif_meta = res.get("exif_meta", {})
                            if exif_meta.get("exif_date") and not photo.exif_date:
                                photo.exif_date = exif_meta["exif_date"]
                            photo.camera_make = exif_meta.get("camera_make") or photo.camera_make
                            photo.camera_model = exif_meta.get("camera_model") or photo.camera_model
                            photo.lens_model = exif_meta.get("lens_model") or photo.lens_model
                            photo.shutter_speed = exif_meta.get("shutter_speed") or photo.shutter_speed
                            photo.aperture = exif_meta.get("aperture") or photo.aperture
                            photo.iso = exif_meta.get("iso") or photo.iso
                            photo.focal_length = exif_meta.get("focal_length") or photo.focal_length

                            db.commit()
                except Exception as ex:
                    print(f"Error processing photo: {ex}")

                completed_count += 1
                if completed_count % 5 == 0 or completed_count == total:
                    with jobs_lock:
                        if job_id in jobs:
                            jobs[job_id].progress = completed_count
                        
        # ── Post-analysis: Burst detection & Scene segmentation ───────────────
        all_photos = db.query(Photo).all()
        photo_dicts = [
            {
                "id": p.id,
                "folder": p.folder,
                "filename": p.filename,
                "exif_date": p.exif_date,
                "overall_score": p.overall_score,
                "has_closed_eyes": p.has_closed_eyes,
                "smile_score": p.smile_score,
                "group_consistency_score": p.group_consistency_score,
                "is_bokeh": p.is_bokeh,
                "duplicate_group_id": p.duplicate_group_id,
            }
            for p in all_photos
        ]
        
        enable_burst = getattr(settings, "enable_burst_grouping", True)
        if enable_burst:
            burst_map, burst_leaders = detect_burst_groups(
                photo_dicts,
                time_threshold_seconds=settings.burst_time_threshold or 2.0
            )
        else:
            burst_map, burst_leaders = {}, set()
        
        enable_scenes = getattr(settings, "enable_scene_chapters", True)
        if enable_scenes:
            scene_map = detect_scenes(
                photo_dicts,
                gap_seconds=getattr(settings, "scene_gap_threshold", 900.0) or 900.0
            )
        else:
            scene_map = {}
        
        for p in all_photos:
            p.burst_group_id = burst_map.get(p.id)
            p.is_burst_leader = p.id in burst_leaders
            if p.id in scene_map:
                p.scene_id, p.scene_name = scene_map[p.id]
            elif not enable_scenes:
                p.scene_id, p.scene_name = None, None
            
        db.commit()

        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].status = "done"
                jobs[job_id].progress = total
                jobs[job_id].message = "Analysis complete."
                
        db.close()
    except Exception as e:
        print(f"Analysis worker error: {e}")
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].status = "error"
                jobs[job_id].message = str(e)


@router.post("/analyze")
def start_analyze(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    
    with jobs_lock:
        jobs[job_id] = JobStatus(
            job_id=job_id,
            status="pending",
            progress=0,
            total=0,
            message="Queuing analysis..."
        )
        
    background_tasks.add_task(analyze_worker, job_id, req.photo_ids, False)
    
    return {"job_id": job_id}


@router.post("/reanalyze")
def start_reanalyze(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    
    with jobs_lock:
        jobs[job_id] = JobStatus(
            job_id=job_id,
            status="pending",
            progress=0,
            total=0,
            message="Queuing full re-analysis..."
        )
        
    background_tasks.add_task(analyze_worker, job_id, req.photo_ids, True)
    
    return {"job_id": job_id}


@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        return jobs[job_id]


@router.post("/photos/{photo_id}/reanalyze")
def reanalyze_single_photo(photo_id: int, db: Session = Depends(get_db)):
    """
    Re-run the full AI analysis pipeline on a single photo synchronously.
    Returns the updated photo dict when done.
    """
    from ..routers.review import _photo_to_dict
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()

    thumbnails_dir = os.path.join(DATA_DIR, "thumbnails")
    os.makedirs(thumbnails_dir, exist_ok=True)

    settings_dict = {
        "blur_threshold": settings.blur_threshold,
        "exposure_low_threshold": settings.exposure_low_threshold,
        "exposure_high_threshold": settings.exposure_high_threshold,
        "auto_accept_threshold": settings.auto_accept_threshold,
        "min_overall_score": settings.min_overall_score,
        "thumbnail_size": settings.thumbnail_size,
        "weight_blur": settings.weight_blur,
        "weight_exposure": settings.weight_exposure,
        "weight_aesthetic": settings.weight_aesthetic,
        "weight_composition": settings.weight_composition,
        "enable_blink_detection": settings.enable_blink_detection,
        "enable_smile_detection": settings.enable_smile_detection,
        "enable_group_consistency": settings.enable_group_consistency,
        "enable_bokeh_detection": settings.enable_bokeh_detection,
        "enable_camera_shake": settings.enable_camera_shake,
        "enable_burst_grouping": settings.enable_burst_grouping,
        "enable_scene_chapters": settings.enable_scene_chapters,
        "enable_preference_learning": settings.enable_preference_learning,
        "enable_explainable_ai": settings.enable_explainable_ai,
        "enable_genre_awareness": settings.enable_genre_awareness,
        "active_shoot_genre": settings.active_shoot_genre,
        "target_delivery_count": settings.target_delivery_count,
        "learned_blur_bias": settings.learned_blur_bias,
        "learned_accept_bias": settings.learned_accept_bias,
        "burst_time_threshold": settings.burst_time_threshold,
        "duplicate_hash_distance": settings.duplicate_hash_distance,
    }

    res = analyze_photo_sync(photo_id, photo.path, thumbnails_dir, settings_dict)

    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Analysis failed"))

    # Update the DB record with fresh results
    photo.is_analyzed = True
    photo.analyzed_at = datetime.utcnow()
    photo.blur_score = res["blur"].get("blur_score")
    photo.is_blurry = res["blur"].get("is_blurry")
    photo.exposure_score = res["exposure"].get("exposure_score")
    photo.exposure_type = res["exposure"].get("exposure_type")
    photo.face_count = res["faces"].get("face_count", 0)
    photo.has_closed_eyes = res["faces"].get("has_closed_eyes", False)
    photo.smile_score = res.get("smile_score", 0.0)
    photo.group_consistency_score = res.get("group_consistency_score")
    photo.detected_faces_json = res.get("detected_faces_json")
    photo.aesthetic_score = res.get("aesthetic", {}).get("aesthetic_score")
    photo.composition_score = res.get("composition", {}).get("composition_score")
    photo.overall_score = res.get("overall_score")
    photo.is_bokeh = res.get("is_bokeh", False)
    photo.is_detail_shot = res.get("is_detail_shot", False)
    photo.is_motion_intentional = res.get("is_motion_intentional", False)
    photo.lighting_type = res.get("lighting_type", "standard")
    photo.is_vip_focused = res.get("is_vip_focused", False)
    photo.reasons_json = res.get("reasons_json")
    photo.status = res['status']

    # Delete old thumbnail to force regeneration
    thumb_path = os.path.join(thumbnails_dir, f"{photo_id}.jpg")
    if os.path.exists(thumb_path):
        os.remove(thumb_path)

    db.commit()
    db.refresh(photo)
    return _photo_to_dict(photo)
