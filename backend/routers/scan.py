from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import uuid
import logging
import os
import concurrent.futures
from PIL import Image

logger = logging.getLogger(__name__)

from ..database import get_db, DATA_DIR
from ..models.photo import Photo, Settings
from ..schemas.photo import ScanRequest, JobStatus
from ..jobs import jobs, jobs_lock
from ..analyzer.duplicates import compute_hash, find_duplicate_groups

router = APIRouter()

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.raf', '.dng', '.rw2', '.heic'}
RAW_EXTS = {'.cr2', '.cr3', '.nef', '.arw', '.orf', '.raf', '.dng', '.rw2'}

def scan_worker(job_id: str, folder_path: str):
    try:
        from ..database import SessionLocal
        db = SessionLocal()
        
        # 1. Discover all image files
        found_files = []
        for root, _, files in os.walk(folder_path):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in IMAGE_EXTS:
                    found_files.append(os.path.join(root, file))
                    
        total_files = len(found_files)
        with jobs_lock:
            jobs[job_id].total = total_files
            jobs[job_id].message = f"Found {total_files} files. Inserting to DB..."
            
        # 2. Insert records to DB
        photo_records = []
        scan_errors = 0
        for i, filepath in enumerate(found_files):
            try:
                # Check if already in DB
                existing = db.query(Photo).filter(Photo.path == filepath).first()
                if not existing:
                    stat = os.stat(filepath)

                    # Try to get basic dimensions
                    width, height = 0, 0
                    try:
                        with Image.open(filepath) as img:
                            width, height = img.size
                    except Exception as e:
                        logger.warning(f"Failed to probe dimensions for {filepath}: {e}")
                        scan_errors += 1
                        
                    ext = os.path.splitext(filepath)[1].lower()
                    is_raw = ext in RAW_EXTS
                    
                    photo = Photo(
                        path=filepath,
                        filename=os.path.basename(filepath),
                        folder=os.path.dirname(filepath),
                        file_size=stat.st_size,
                        width=width,
                        height=height,
                        is_raw=is_raw,
                        raw_format=ext[1:] if is_raw else None
                    )
                    db.add(photo)
                    db.flush() # get ID
                    photo_records.append(photo.id)
            except Exception as e:
                logger.warning(f"Error processing {filepath}: {e}")
                scan_errors += 1

            if i % 100 == 0:
                with jobs_lock:
                    jobs[job_id].progress = i
                    
        db.commit()
        
        # 3. Compute hashes & Duplicate Detection
        with jobs_lock:
            jobs[job_id].message = "Computing hashes for duplicates..."
            jobs[job_id].progress = 0
            
        # Fetch all photos without group id
        all_photos = db.query(Photo).filter(Photo.duplicate_group_id == None).all()
        
        num_hash_workers = min(max(2, (os.cpu_count() or 4) - 1), 8)
        photo_hashes = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_hash_workers) as executor:
            future_to_id = {executor.submit(compute_hash, p.path): p.id for p in all_photos}
            for i, future in enumerate(concurrent.futures.as_completed(future_to_id)):
                pid = future_to_id[future]
                try:
                    h = future.result()
                    photo_hashes.append((pid, h))
                except Exception as e:
                    logger.warning(f"Failed to compute hash for photo ID {pid}: {e}")
                    scan_errors += 1
                if i % 50 == 0:
                    with jobs_lock:
                        jobs[job_id].progress = i
                    
        # 4. Group Duplicates
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            
        groups = find_duplicate_groups(photo_hashes, settings.duplicate_hash_distance)
        for pid, gid in groups.items():
            db.query(Photo).filter(Photo.id == pid).update({"duplicate_group_id": gid})
        db.commit()

        # 5. Pre-generate fast thumbnails in parallel so gallery loads instantly
        thumbnails_dir = os.path.join(DATA_DIR, "thumbnails")
        os.makedirs(thumbnails_dir, exist_ok=True)
        
        all_db_photos = db.query(Photo).all()
        photos_needing_thumbs = [
            (p.id, p.path) for p in all_db_photos 
            if not os.path.exists(os.path.join(thumbnails_dir, f"{p.id}.jpg"))
        ]
        
        if photos_needing_thumbs:
            with jobs_lock:
                jobs[job_id].message = f"Pre-generating fast thumbnails ({len(photos_needing_thumbs)})..."
            
            from ..analyzer.pipeline import fast_generate_thumbnail_from_path
            thumb_workers = min(max(2, (os.cpu_count() or 4)), 8)
            thumb_size = settings.thumbnail_size if settings else 300
            with concurrent.futures.ThreadPoolExecutor(max_workers=thumb_workers) as executor:
                list(executor.map(
                    lambda item: fast_generate_thumbnail_from_path(item[1], item[0], thumb_size, thumbnails_dir),
                    photos_needing_thumbs
                ))
        
        with jobs_lock:
            jobs[job_id].status = "done"
            jobs[job_id].progress = total_files
            jobs[job_id].message = "Scan completed. Ready for analysis."
            if scan_errors:
                jobs[job_id].message += f" ({scan_errors} file(s) had warnings — see log.)"
            
        db.close()
        
        # Start analysis job automatically
        # To avoid circular dependency, we'll start it by invoking analyze endpoint logic 
        # or just mark scan done and let frontend call analyze. Let's do the latter for simplicity
        # as the spec says "start background analysis job", we can trigger it
        from .analyze import analyze_worker
        analysis_job_id = str(uuid.uuid4())
        with jobs_lock:
            jobs[analysis_job_id] = JobStatus(
                job_id=analysis_job_id,
                status="pending",
                progress=0,
                total=0,
                message="Starting automatic analysis..."
            )
        
        # Fire and forget analysis
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        executor.submit(analyze_worker, analysis_job_id, None)
        
    except Exception as e:
        with jobs_lock:
            jobs[job_id].status = "error"
            jobs[job_id].message = f"Error during scan: {str(e)}"
        print(f"Scan error: {e}")

@router.post("/scan")
def start_scan(req: ScanRequest, background_tasks: BackgroundTasks):
    if not os.path.exists(req.folder_path):
        raise HTTPException(status_code=400, detail="Folder path does not exist")
        
    job_id = str(uuid.uuid4())
    
    with jobs_lock:
        jobs[job_id] = JobStatus(
            job_id=job_id,
            status="running",
            progress=0,
            total=0,
            message="Starting scan..."
        )
        
    background_tasks.add_task(scan_worker, job_id, req.folder_path)
    
    return {"job_id": job_id, "total": 0}
