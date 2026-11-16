"""Offline single-person face descriptor extraction and matching."""

from __future__ import annotations

import base64
import concurrent.futures
import json
import logging
import os
import sys
import threading
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from .raw_fastpath import load_bgr_fast

logger = logging.getLogger(__name__)
_thread_local = threading.local()
_descriptor_cache_lock = threading.Lock()
_descriptor_cache: Dict[tuple, np.ndarray] = {}
_DESCRIPTOR_CACHE_MAX = 20000


def _get_model_path(filename: str) -> Optional[str]:
    """Locate an ONNX model in dev or PyInstaller bundle."""
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(os.path.join(sys._MEIPASS, "models_data", filename))
        candidates.append(os.path.join(sys._MEIPASS, filename))
    exe_dir = os.path.dirname(sys.executable)
    candidates.extend([
        os.path.join(exe_dir, "models_data", filename),
        os.path.join(exe_dir, "_internal", "models_data", filename),
        os.path.join(exe_dir, "..", "models_data", filename),
        os.path.join(os.path.dirname(__file__), "..", "models_data", filename),
        os.path.join(os.path.dirname(__file__), "..", "..", "backend", "models_data", filename),
        os.path.join(os.getcwd(), "backend", "models_data", filename),
    ])
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def _get_thread_sface():
    if not hasattr(_thread_local, "sface_init"):
        _thread_local.sface = None
        if hasattr(cv2, "FaceRecognizerSF"):
            sp = _get_model_path("face_recognition_sface_2021dec.onnx")
            if sp:
                try:
                    _thread_local.sface = cv2.FaceRecognizerSF.create(sp, "")
                except Exception as e:
                    logger.warning(f"Failed to load SFace recognizer: {e}")
        _thread_local.sface_init = True
    return _thread_local.sface


def _get_thread_yunet():
    if not hasattr(_thread_local, "yunet_init"):
        _thread_local.yunet = None
        if hasattr(cv2, "FaceDetectorYN"):
            yp = _get_model_path("face_detection_yunet_2023mar.onnx")
            if yp:
                try:
                    _thread_local.yunet = cv2.FaceDetectorYN.create(yp, "", (320, 320), 0.55, 0.3, 5000)
                except Exception as e:
                    logger.warning(f"Failed to load YuNet detector for SFace alignment: {e}")
        _thread_local.yunet_init = True
    return _thread_local.yunet


def _detect_yunet_faces(img_bgr: np.ndarray):
    yunet = _get_thread_yunet()
    if yunet is None or img_bgr is None or img_bgr.size == 0:
        return None
    h, w = img_bgr.shape[:2]
    if w < 16 or h < 16:
        return None
    try:
        yunet.setInputSize((w, h))
        _, faces = yunet.detect(img_bgr)
        return faces
    except Exception:
        return None


def _match_yunet_row(yunet_faces, box: Optional[list], img_w: int, img_h: int, det_w: int, det_h: int):
    if yunet_faces is None or len(yunet_faces) == 0:
        return None
    if box is None or len(box) != 4:
        # Pick largest / highest-confidence face (used for single-face VIP thumbnail)
        return max(yunet_faces, key=lambda r: float(r[2] * r[3]) * float(r[14]))
    bx, by, bw, bh = [float(v) for v in box]
    if det_w and det_h and (det_w != img_w or det_h != img_h):
        sx = img_w / float(det_w)
        sy = img_h / float(det_h)
        bx, by, bw, bh = bx * sx, by * sy, bw * sx, bh * sy
    bcx, bcy = bx + bw / 2.0, by + bh / 2.0
    best_row = None
    best_score = -1.0
    for row in yunet_faces:
        rx, ry, rw, rh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
        ix1, iy1 = max(bx, rx), max(by, ry)
        ix2, iy2 = min(bx + bw, rx + rw), min(by + bh, ry + rh)
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        union = bw * bh + rw * rh - inter
        iou = inter / union if union > 0 else 0.0
        rcx, rcy = rx + rw / 2.0, ry + rh / 2.0
        dist = ((bcx - rcx) ** 2 + (bcy - rcy) ** 2) ** 0.5
        score = iou - dist / max(img_w, img_h, 1) * 0.25
        if score > best_score:
            best_score = score
            best_row = row
    return best_row if best_score > 0.05 else None


def _sface_feature_from_aligned(aligned_bgr: np.ndarray) -> Optional[np.ndarray]:
    sface = _get_thread_sface()
    if sface is None or aligned_bgr is None or aligned_bgr.size == 0:
        return None
    try:
        feat = sface.feature(aligned_bgr).flatten().astype(np.float32)
        norm = float(np.linalg.norm(feat))
        if norm > 1e-8:
            return (feat / norm).astype(np.float32)
    except Exception as e:
        logger.warning(f"SFace feature extraction failed: {e}")
    return None


def extract_face_descriptor(bgr_crop: np.ndarray) -> Optional[np.ndarray]:
    """Compute an L2-normalized face embedding from a BGR face crop.

    Uses OpenCV SFace (deep face recognition ONNX) when available, falling back
    to CLAHE-normalized grayscale + spatial HSV histogram.
    """
    if bgr_crop is None or bgr_crop.size == 0:
        return None
    sface = _get_thread_sface()
    if sface is not None:
        try:
            yunet_faces = _detect_yunet_faces(bgr_crop)
            row = _match_yunet_row(yunet_faces, None, bgr_crop.shape[1], bgr_crop.shape[0], 0, 0)
            if row is not None:
                aligned = sface.alignCrop(bgr_crop, row)
            else:
                # Tight center crop fallback if YuNet misses on a pre-cropped face thumbnail
                ch, cw = bgr_crop.shape[:2]
                pad_x, pad_y = int(cw * 0.16), int(ch * 0.16)
                tight = bgr_crop[pad_y:max(pad_y + 1, ch - pad_y), pad_x:max(pad_x + 1, cw - pad_x)]
                aligned = cv2.resize(tight, (112, 112), interpolation=cv2.INTER_AREA)
            feat = _sface_feature_from_aligned(aligned)
            if feat is not None:
                return feat
        except Exception as e:
            logger.warning(f"SFace feature extraction failed, falling back: {e}")
    try:
        resized = cv2.resize(bgr_crop, (64, 64), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
        norm_gray = clahe.apply(gray)
        small_gray = cv2.resize(norm_gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
        small_gray = (small_gray - float(np.mean(small_gray))) / (float(np.std(small_gray)) + 1e-6)
        gray_vec = small_gray.flatten()

        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hist_parts: List[np.ndarray] = []
        for gy in range(2):
            for gx in range(2):
                cell = hsv[gy * 32:(gy + 1) * 32, gx * 32:(gx + 1) * 32]
                h = cv2.calcHist([cell], [0, 1], None, [12, 8], [0, 180, 0, 256]).flatten()
                h = h / (float(np.sum(h)) + 1e-6)
                hist_parts.append(h.astype(np.float32))
        color_vec = np.concatenate(hist_parts)

        # Weight structural facial features (0.7) + color/skin/hair (0.3)
        gray_norm = gray_vec / (float(np.linalg.norm(gray_vec)) + 1e-6)
        color_norm = color_vec / (float(np.linalg.norm(color_vec)) + 1e-6)
        combined = np.concatenate([gray_norm * 0.7, color_norm * 0.3])
        norm = float(np.linalg.norm(combined))
        if norm <= 1e-8:
            return None
        return (combined / norm).astype(np.float32)
    except Exception as e:
        logger.warning(f"Failed to extract face descriptor: {e}")
        return None


def decode_b64_bgr(thumbnail_b64: str) -> Optional[np.ndarray]:
    if not thumbnail_b64:
        return None
    try:
        raw = base64.b64decode(thumbnail_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _crop_face_from_image(img_bgr: np.ndarray, box: list, det_w: int, det_h: int) -> Optional[np.ndarray]:
    if img_bgr is None or len(box) != 4:
        return None
    ih, iw = img_bgr.shape[:2]
    x, y, w, h = box
    if det_w and det_h and (det_w != iw or det_h != ih):
        sx = iw / float(det_w)
        sy = ih / float(det_h)
        x, y, w, h = x * sx, y * sy, w * sx, h * sy
    cx, cy = x + w / 2.0, y + h / 2.0
    side = max(w, h) * 1.5
    x1 = max(0, int(cx - side / 2.0))
    y1 = max(0, int(cy - side / 2.0))
    x2 = min(iw, int(cx + side / 2.0))
    y2 = min(ih, int(cy + side / 2.0))
    if x2 <= x1 or y2 <= y1:
        return None
    return img_bgr[y1:y2, x1:x2]


def match_vip_face_across_photos(
    target_b64: str,
    photos: List[Any],
    source_photo_id: Optional[int] = None,
    threshold: Optional[float] = None,
    thumbnails_dir: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return [{photo_id, face_index, similarity}, ...] sorted by similarity desc."""
    use_sface = _get_thread_sface() is not None
    if threshold is None:
        threshold = 0.363 if use_sface else 0.72
    target_bgr = decode_b64_bgr(target_b64)
    target_desc = extract_face_descriptor(target_bgr) if target_bgr is not None else None
    if target_desc is None:
        return []

    mode_key = "sface_aligned_v2" if use_sface else "hist"

    def _score_photo(photo: Any) -> Optional[Dict[str, Any]]:
        pid = getattr(photo, "id", None)
        if pid is None:
            return None
        if source_photo_id is not None and pid == source_photo_id:
            return {"photo_id": pid, "face_index": 0, "similarity": 1.0}

        faces_json = getattr(photo, "detected_faces_json", None)
        path = getattr(photo, "path", None)
        if not faces_json:
            return None

        try:
            faces = json.loads(faces_json)
        except Exception:
            return None
        if not faces:
            return None

        analyzed_at = str(getattr(photo, "analyzed_at", "") or "")
        face_items = []
        all_cached = True
        for idx, face in enumerate(faces):
            if not isinstance(face, dict):
                continue
            box = face.get("box", [])
            if len(box) != 4:
                continue
            det_w = int(face.get("det_width") or getattr(photo, "width", 0) or 0)
            det_h = int(face.get("det_height") or getattr(photo, "height", 0) or 0)
            cache_key = (mode_key, pid, idx, tuple(box), det_w, det_h, analyzed_at)
            with _descriptor_cache_lock:
                cached_desc = _descriptor_cache.get(cache_key)
            if cached_desc is None:
                all_cached = False
            face_items.append((idx, box, det_w, det_h, cache_key, cached_desc))

        if not face_items:
            return None

        img_bgr = None
        if not all_cached:
            if thumbnails_dir:
                thumb_path = os.path.join(thumbnails_dir, f"{pid}.jpg")
                if os.path.exists(thumb_path):
                    img_bgr = cv2.imread(thumb_path)
            if img_bgr is None:
                if not path or not os.path.exists(path):
                    return None
                img_bgr, _ = load_bgr_fast(path, min_long_edge=720, prefer_embedded_preview=True)
            if img_bgr is None:
                return None

        sface = _get_thread_sface() if use_sface else None
        yunet_faces = _detect_yunet_faces(img_bgr) if (not all_cached and img_bgr is not None and sface is not None) else None

        best_sim = -1.0
        best_idx = 0
        for idx, box, det_w, det_h, cache_key, cached_desc in face_items:
            desc = cached_desc
            if desc is None:
                eff_w = det_w or img_bgr.shape[1]
                eff_h = det_h or img_bgr.shape[0]
                if sface is not None:
                    row = _match_yunet_row(yunet_faces, box, img_bgr.shape[1], img_bgr.shape[0], eff_w, eff_h)
                    if row is not None:
                        aligned = sface.alignCrop(img_bgr, row)
                        desc = _sface_feature_from_aligned(aligned)
                if desc is None:
                    crop = _crop_face_from_image(img_bgr, box, eff_w, eff_h)
                    desc = extract_face_descriptor(crop) if crop is not None else None
                if desc is not None:
                    with _descriptor_cache_lock:
                        if len(_descriptor_cache) >= _DESCRIPTOR_CACHE_MAX:
                            _descriptor_cache.clear()
                        _descriptor_cache[cache_key] = desc
            if desc is None:
                continue
            sim = float(np.dot(target_desc, desc))
            if sim > best_sim:
                best_sim = sim
                best_idx = idx

        if best_sim >= threshold:
            return {"photo_id": pid, "face_index": best_idx, "similarity": round(best_sim, 4)}
        return None

    workers = min(max(2, (os.cpu_count() or 4) - 1), 8)
    matches: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(_score_photo, photos):
            if res is not None:
                matches.append(res)

    matches.sort(key=lambda m: m["similarity"], reverse=True)
    return matches
