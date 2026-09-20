import cv2
import numpy as np
import os
import io
import json
from datetime import datetime
from PIL import Image, ExifTags
from sqlalchemy.orm import Session

RAW_EXTS = {'.cr2', '.cr3', '.nef', '.arw', '.orf', '.raf', '.dng', '.rw2'}

try:
    import rawpy
except ImportError:
    rawpy = None

from ..models.photo import Photo, Settings
from ..schemas.photo import JobStatus
from .blur import analyze_blur
from .exposure import analyze_exposure
from .faces import analyze_faces
from .aesthetic import analyze_aesthetic
from .composition import analyze_composition
from .details import analyze_details

def format_shutter(exposure_time):
    if not exposure_time:
        return None
    try:
        val = float(exposure_time)
        if val >= 1.0:
            return f"{val:.1f}s" if val % 1 else f"{int(val)}s"
        elif val > 0:
            recip = round(1.0 / val)
            return f"1/{recip}s"
    except Exception:
        pass
    return str(exposure_time)

def format_aperture(f_number):
    if not f_number:
        return None
    try:
        val = float(f_number)
        return f"f/{val:.1f}" if val % 1 else f"f/{int(val)}"
    except Exception:
        pass
    return f"f/{f_number}"

def format_focal_length(focal):
    if not focal:
        return None
    try:
        val = float(focal)
        return f"{int(round(val))}mm"
    except Exception:
        pass
    return f"{focal}mm"

def extract_exif_metadata(image_path: str) -> dict:
    meta = {
        "exif_date": None,
        "camera_make": None,
        "camera_model": None,
        "lens_model": None,
        "shutter_speed": None,
        "aperture": None,
        "iso": None,
        "focal_length": None
    }
    
    try:
        img = Image.open(image_path)
        exif = img._getexif()
        if exif:
            # Map numeric tags to string names
            named_exif = {}
            for k, v in exif.items():
                tag = ExifTags.TAGS.get(k, k)
                named_exif[tag] = v
                
            # Date
            meta["exif_date"] = named_exif.get("DateTimeOriginal") or named_exif.get("DateTime")
            if meta["exif_date"]:
                meta["exif_date"] = str(meta["exif_date"])
                
            # Camera & Lens
            meta["camera_make"] = str(named_exif.get("Make")).strip() if named_exif.get("Make") else None
            meta["camera_model"] = str(named_exif.get("Model")).strip() if named_exif.get("Model") else None
            meta["lens_model"] = str(named_exif.get("LensModel")).strip() if named_exif.get("LensModel") else None
            
            # Exposure parameters
            meta["shutter_speed"] = format_shutter(named_exif.get("ExposureTime"))
            meta["aperture"] = format_aperture(named_exif.get("FNumber"))
            
            # ISO
            iso = named_exif.get("ISOSpeedRatings") or named_exif.get("PhotographicSensitivity")
            if iso is not None:
                try:
                    meta["iso"] = int(iso if isinstance(iso, (int, float)) else iso[0])
                except Exception:
                    pass
                    
            # Focal Length
            meta["focal_length"] = format_focal_length(named_exif.get("FocalLength"))
    except Exception:
        pass
        
    return meta

def load_image(path: str) -> tuple[np.ndarray, dict]:
    ext = path.lower().split('.')[-1]
    raw_exts = ['cr2', 'cr3', 'nef', 'arw', 'orf', 'raf', 'dng', 'rw2']
    
    meta = extract_exif_metadata(path)
    
    if ext in raw_exts and rawpy is not None:
        with rawpy.imread(path) as raw:
            rgb = raw.postprocess(half_size=True) # half_size for speed
            image_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    else:
        # Standard images or raw fallback
        image_bgr = cv2.imread(path)
        
    return image_bgr, meta

def generate_thumbnail(image: np.ndarray, photo_id: int, size: int, thumbnails_dir: str) -> str:
    try:
        h, w = image.shape[:2]
        if max(h, w) > size:
            scale = size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            thumb = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        else:
            thumb = image
            
        thumb_path = os.path.join(thumbnails_dir, f"{photo_id}.jpg")
        cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return thumb_path
    except Exception as e:
        print(f"Error generating thumbnail for {photo_id}: {e}")
        return ""

def fast_generate_thumbnail_from_path(photo_path: str, photo_id: int, size: int, thumbnails_dir: str) -> str:
    """
    High-performance thumbnail generation directly from disk:
    1. RAW: extracts camera-embedded JPEG preview in ~2ms (1000x faster than demosaicing).
    2. JPEG: uses Pillow draft mode to decode at 1/8th DCT resolution in ~5ms.
    3. Fallback to standard Pillow / OpenCV if needed.
    """
    thumb_path = os.path.join(thumbnails_dir, f"{photo_id}.jpg")
    ext = os.path.splitext(photo_path)[1].lower()

    # 1. High-speed RAW extraction
    if ext in RAW_EXTS and rawpy is not None:
        try:
            with rawpy.imread(photo_path) as raw:
                try:
                    thumb = raw.extract_thumb()
                    if thumb.format == rawpy.ThumbFormat.JPEG:
                        with Image.open(io.BytesIO(thumb.data)) as t_img:
                            t_img.thumbnail((size, size), Image.Resampling.BILINEAR)
                            if t_img.mode != "RGB":
                                t_img = t_img.convert("RGB")
                            t_img.save(thumb_path, "JPEG", quality=85, optimize=False)
                            return thumb_path
                except Exception:
                    pass
        except Exception:
            pass

    # 2. Fast JPEG / Raster draft mode
    try:
        with Image.open(photo_path) as img:
            img.draft("RGB", (size, size))
            img.thumbnail((size, size), Image.Resampling.BILINEAR)
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=85, optimize=False)
            return thumb_path
    except Exception:
        pass

    # 3. Fallback: full load and resize
    try:
        img, _ = load_image(photo_path)
        if img is not None:
            return generate_thumbnail(img, photo_id, size, thumbnails_dir)
    except Exception as e:
        print(f"Fallback thumbnail failed for {photo_id}: {e}")

    return ""

def compute_overall_score(blur, exposure, aesthetic, composition, faces, blur_res, exp_res, comp_res, detail_res, settings) -> float:
    score = (
        blur * settings.weight_blur +
        exposure * settings.weight_exposure +
        aesthetic * settings.weight_aesthetic +
        composition * settings.weight_composition
    )
    
    # 1. Closed eyes penalty (only for primary VIP subjects, not candid laughter peaks)
    if getattr(settings, 'enable_blink_detection', True) and faces.get('has_closed_eyes', False):
        score -= 25.0
        
    # 2. Flattering smile bonus (if enabled)
    if getattr(settings, 'enable_smile_detection', True):
        smile_score = faces.get('smile_score', 0.0)
        if smile_score > 0:
            score += (smile_score / 100.0) * 8.0
        
    # 3. Group consistency factor for multi-subject shots (if enabled)
    if getattr(settings, 'enable_group_consistency', True):
        grp_score = faces.get('group_consistency_score')
        if grp_score is not None and faces.get('face_count', 0) >= 2:
            if grp_score >= 85.0:
                score += 10.0  # Perfect group synchronization
            elif grp_score < 50.0:
                score -= 15.0  # Mismatched group
            
    # 4. Intentional bokeh bonus (if enabled)
    if getattr(settings, 'enable_bokeh_detection', True) and blur_res.get('is_bokeh', False):
        score += 5.0

    # 5. Intentional artistic motion (panning / dragged shutter)
    if blur_res.get('is_motion_intentional', False):
        score += 8.0

    # 6. Event & Stage Lighting Atmosphere
    lighting = exp_res.get('lighting_type', 'standard')
    if lighting in ('colored_gels', 'stage_backlight'):
        score += 6.0

    # 7. Detail & Flat-lay shot quality
    if detail_res.get('is_detail_shot', False):
        score += 6.0
        
    return max(0.0, min(100.0, score))

def generate_explainable_reasons(overall: float, blur_res: dict, exp_res: dict, face_res: dict, comp_res: dict, detail_res: dict, status: str, settings) -> dict:
    positives = []
    rejections = []

    # Sharpness / Focus
    if blur_res.get("is_motion_intentional"):
        positives.append("Artistic motion (panning / dragged shutter) recognized (+8)")
    elif blur_res.get("is_bokeh"):
        positives.append("Intentional shallow depth of field (sharp subject) (+15)")
    elif blur_res.get("blur_score", 0) >= 75:
        positives.append("Crisp critical sharpness across frame (+15)")
    elif blur_res.get("is_blurry"):
        if blur_res.get("has_motion_blur"):
            rejections.append("Severe camera shake / hand jitter (-20)")
        else:
            rejections.append("Soft focus / missed subject sharpness (-25)")

    # Faces & Expressions
    if face_res.get("face_count", 0) > 0:
        if face_res.get("has_closed_eyes"):
            rejections.append("Blink / closed eyes on primary subject (-25)")
        else:
            positives.append("Open, clear eyes on primary subjects")

        if face_res.get("smile_score", 0) >= 50:
            positives.append(f"Flattering joyful expression ({int(face_res['smile_score'])}/100)")

        grp = face_res.get("group_consistency_score")
        if grp is not None and face_res.get("face_count", 0) >= 2:
            if grp >= 85:
                positives.append(f"Excellent group synchronization ({int(grp)}%) (+10)")
            elif grp < 50:
                rejections.append(f"Mismatched group timing ({int(grp)}%) (-15)")
    elif detail_res.get("is_detail_shot"):
        dtype = detail_res.get("detail_type", "detail").replace("_", " ").title()
        positives.append(f"{dtype} recognized: micro-contrast & geometric balance (+15)")

    # Exposure & Lighting
    lighting = exp_res.get("lighting_type", "standard")
    if lighting == "stage_backlight":
        positives.append("Theatrical stage backlight / rim silhouette recognized (+6)")
    elif lighting == "colored_gels":
        positives.append("Vibrant stage lighting / colored gels preserved (+6)")
    else:
        if exp_res.get("exposure_type") == "underexposed":
            rejections.append("Crushed shadows / underexposed frame (-15)")
        elif exp_res.get("exposure_type") == "overexposed":
            rejections.append("Blown highlight clipping / overexposed frame (-15)")
        elif exp_res.get("exposure_score", 0) >= 75:
            positives.append("Balanced dynamic range & natural skin tones")

    # Composition
    if comp_res.get("has_leading_lines"):
        positives.append("Dynamic leading line composition (+8)")
    if comp_res.get("composition_score", 0) >= 75:
        positives.append("Balanced rule-of-thirds framing")
    elif not comp_res.get("has_good_headroom"):
        rejections.append("Awkward framing / cramped headroom (-10)")

    # Summary
    if status == "accepted":
        lead = positives[0] if positives else "High overall technical quality"
        summary = f"Accepted · {lead}"
    elif status == "rejected":
        lead = rejections[0] if rejections else "Low overall quality score"
        summary = f"Rejected · {lead}"
    else:
        summary = f"Review · Balanced capture (Score: {int(overall)})"

    return {
        "summary": summary,
        "positives": positives,
        "rejections": rejections
    }

def analyze_photo_sync(photo_id: int, image_path: str, thumbnails_dir: str, settings_dict: dict) -> dict:
    class DummySettings:
        pass
    
    s = DummySettings()
    for k, v in settings_dict.items():
        setattr(s, k, v)
        
    try:
        image_bgr, meta = load_image(image_path)
        if image_bgr is None:
            raise ValueError(f"Failed to load image: {image_path}")
            
        generate_thumbnail(image_bgr, photo_id, s.thumbnail_size, thumbnails_dir)
        
        # 1. Analyze faces first (with subject hierarchy & candid peaks)
        face_res = analyze_faces(image_bgr)
        detected_faces = face_res.get("detected_faces", [])
        
        # 2. Analyze details & flat-lays (rings, food, stationery, venue)
        detail_res = analyze_details(image_bgr, face_count=face_res.get("face_count", 0))
        
        # 3. Blur, intentional motion (panning/dragged shutter), and bokeh
        blur_res = analyze_blur(image_bgr, s, detected_faces=detected_faces)
        
        # 4. Exposure & Stage Lighting
        exp_res = analyze_exposure(image_bgr, s, detected_faces=detected_faces, filename=os.path.basename(image_path))
        
        # 5. Aesthetic & Composition
        aes_res = analyze_aesthetic(image_bgr)
        comp_res = analyze_composition(image_bgr, detected_faces=detected_faces)
        
        overall = compute_overall_score(
            blur_res.get('blur_score', 50),
            exp_res.get('exposure_score', 50),
            aes_res.get('aesthetic_score', 50),
            comp_res.get('composition_score', 50),
            face_res,
            blur_res,
            exp_res,
            comp_res,
            detail_res,
            s
        )
        
        # Determine status (applying any learned user acceptance biases if preference learning is enabled)
        learned_accept = getattr(s, 'learned_accept_bias', 0.0) if getattr(s, 'enable_preference_learning', True) else 0.0
        learned_blur = getattr(s, 'learned_blur_bias', 0.0) if getattr(s, 'enable_preference_learning', True) else 0.0
        accept_thresh = s.auto_accept_threshold + learned_accept
        reject_thresh = s.min_overall_score + learned_blur
        
        status = "pending"
        if overall < reject_thresh or blur_res.get('is_blurry', False):
            status = "rejected"
        elif overall >= accept_thresh:
            status = "accepted"

        # Explainable AI reason breakdown
        reasons = generate_explainable_reasons(
            overall, blur_res, exp_res, face_res, comp_res, detail_res, status, s
        )

        genre = getattr(s, 'active_shoot_genre', 'wedding')
        is_vip = any(f.get("is_vip", False) for f in detected_faces) if detected_faces else False
            
        return {
            "success": True,
            "blur": blur_res,
            "exposure": exp_res,
            "faces": face_res,
            "details": detail_res,
            "is_bokeh": blur_res.get("is_bokeh", False),
            "is_detail_shot": detail_res.get("is_detail_shot", False),
            "is_motion_intentional": blur_res.get("is_motion_intentional", False),
            "lighting_type": exp_res.get("lighting_type", "standard"),
            "is_vip_focused": is_vip,
            "smile_score": face_res.get("smile_score", 0.0),
            "group_consistency_score": face_res.get("group_consistency_score"),
            "detected_faces_json": json.dumps(detected_faces),
            "reasons_json": json.dumps(reasons),
            "aesthetic": aes_res,
            "composition": comp_res,
            "overall_score": overall,
            "status": status,
            "shoot_genre": genre,
            "exif_meta": meta
        }
    except Exception as e:
        print(f"Error analyzing photo {photo_id}: {e}")
        return {"success": False, "error": str(e)}
