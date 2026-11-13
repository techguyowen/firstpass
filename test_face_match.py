"""Unit tests for single-person face descriptor matching."""

import base64
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from backend.analyzer.face_match import (  # noqa: E402
    extract_face_descriptor,
    match_vip_face_across_photos,
)


def _make_face_patch(seed: int, size: int = 128) -> np.ndarray:
    rng = np.random.RandomState(seed)
    patch = rng.randint(40, 220, (size, size, 3), dtype=np.uint8)
    # Add deterministic facial-like contrast blocks
    cv2.circle(patch, (size // 3, size // 3), size // 10, (20, 20, 20), -1)
    cv2.circle(patch, (2 * size // 3, size // 3), size // 10, (20, 20, 20), -1)
    cv2.rectangle(patch, (size // 3, 2 * size // 3), (2 * size // 3, 3 * size // 4), (60, 40, 40), -1)
    return patch


def test_match_vip_face_across_photos(tmp_path, monkeypatch):
    # Test deterministic descriptor matching without requiring real human face geometry
    monkeypatch.setattr("backend.analyzer.face_match._get_thread_sface", lambda: None)
    target_face = _make_face_patch(seed=42)
    other_face = _make_face_patch(seed=999)

    _, buf = cv2.imencode(".jpg", target_face)
    target_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

    # Photo 1: contains target_face
    canvas1 = np.zeros((300, 300, 3), dtype=np.uint8)
    canvas1[50:178, 50:178] = target_face
    p1_path = tmp_path / "p1.jpg"
    cv2.imwrite(str(p1_path), canvas1)

    # Photo 2: contains other_face
    canvas2 = np.zeros((300, 300, 3), dtype=np.uint8)
    canvas2[50:178, 50:178] = other_face
    p2_path = tmp_path / "p2.jpg"
    cv2.imwrite(str(p2_path), canvas2)

    class _FakePhoto:
        def __init__(self, pid, path):
            self.id = pid
            self.path = str(path)
            self.width = 300
            self.height = 300
            self.detected_faces_json = json.dumps([
                {"box": [71, 71, 85, 85], "det_width": 300, "det_height": 300}
            ])

    matches = match_vip_face_across_photos(
        target_b64,
        [_FakePhoto(1, p1_path), _FakePhoto(2, p2_path)],
        threshold=0.75,
    )
    matched_ids = [m["photo_id"] for m in matches]
    assert 1 in matched_ids
    assert 2 not in matched_ids
    assert extract_face_descriptor(target_face) is not None
