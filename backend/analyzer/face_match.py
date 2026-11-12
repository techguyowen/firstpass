"""Offline single-person face descriptor extraction and matching."""

from __future__ import annotations

import base64
import concurrent.futures
import json
import logging
import os
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from .raw_fastpath import load_bgr_fast

logger = logging.getLogger(__name__)


def extract_face_descriptor(bgr_crop: np.ndarray) -> Optional[np.ndarray]:
    """Compute an L2-normalized descriptor from a BGR face crop.

    Combines CLAHE-normalized 32x32 grayscale structure with a 4x4 spatial
    HSV color histogram so matching works 100% offline with zero extra weights.
    """
    if bgr_crop is None or bgr_crop.size == 0:
        return None
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
    threshold: float = 0.72,
) -> List[Dict[str, Any]]:
    """Return [{photo_id, face_index, similarity}, ...] sorted by similarity desc."""
    target_bgr = decode_b64_bgr(target_b64)
    target_desc = extract_face_descriptor(target_bgr) if target_bgr is not None else None
    if target_desc is None:
        return []

    def _score_photo(photo: Any) -> Optional[Dict[str, Any]]:
        pid = getattr(photo, "id", None)
        if pid is None:
            return None
        if source_photo_id is not None and pid == source_photo_id:
            return {"photo_id": pid, "face_index": 0, "similarity": 1.0}

        faces_json = getattr(photo, "detected_faces_json", None)
        path = getattr(photo, "path", None)
        if not faces_json or not path or not os.path.exists(path):
            return None

        try:
            faces = json.loads(faces_json)
        except Exception:
            return None
        if not faces:
            return None

        img_bgr, _ = load_bgr_fast(path, min_long_edge=720, prefer_embedded_preview=True)
        if img_bgr is None:
            return None

        best_sim = -1.0
        best_idx = 0
        for idx, face in enumerate(faces):
            if not isinstance(face, dict):
                continue
            box = face.get("box", [])
            det_w = int(face.get("det_width") or getattr(photo, "width", 0) or img_bgr.shape[1])
            det_h = int(face.get("det_height") or getattr(photo, "height", 0) or img_bgr.shape[0])
            crop = _crop_face_from_image(img_bgr, box, det_w, det_h)
            desc = extract_face_descriptor(crop) if crop is not None else None
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
