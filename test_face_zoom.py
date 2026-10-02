"""
Regression tests for face-zoom alignment:
1. analyze_faces reports the detection coordinate space (det_width/det_height),
   even when inference ran on a downscaled array.
2. build_faces_payload passes detection dims through per face, exposes them
   top-level, and falls back to photo dims for legacy rows.
"""

import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import numpy as np

from backend.analyzer.faces import analyze_faces
from backend.routers.review import build_faces_payload


def test_face_detection_dims():
    print("[1] Testing detection dims on a downscaled inference path...")
    # 3000x2000 forces the internal >1600px downscale; boxes must still be
    # reported in full-res coordinates with matching det dims.
    img = np.zeros((2000, 3000, 3), dtype=np.uint8)
    res = analyze_faces(img)
    assert res["det_width"] == 3000, f"det_width should be 3000, got {res['det_width']}"
    assert res["det_height"] == 2000, f"det_height should be 2000, got {res['det_height']}"
    for f in res["detected_faces"]:
        x, y, w, h = f["box"]
        assert 0 <= x <= 3000 and 0 <= y <= 2000, f"box outside det space: {f['box']}"
    print(f"  det space: {res['det_width']}x{res['det_height']}, faces: {len(res['detected_faces'])}")
    print("  ✓ Detection dims verified!")


def test_faces_payload_passthrough():
    print("\n[2] Testing faces payload detection-dims passthrough...")
    raw = [
        {"box": [1500, 1000, 300, 400], "has_closed_eyes": False,
         "is_smiling": True, "smile_score": 80.0, "sharpness": 120.0,
         "det_width": 3000, "det_height": 2000},
        {"box": [200, 200, 100, 120], "has_closed_eyes": False,
         "is_smiling": False, "smile_score": 0.0, "sharpness": 90.0,
         "det_width": 3000, "det_height": 2000},
    ]
    faces, det_w, det_h = build_faces_payload(raw, {}, 7, 6000, 4000)
    assert len(faces) == 2
    assert faces[0]["det_width"] == 3000 and faces[0]["det_height"] == 2000
    assert faces[0]["url"] == "/api/photos/7/face/0"
    assert (det_w, det_h) == (3000, 2000), f"top-level dims wrong: {(det_w, det_h)}"
    # Exact relative center of the primary face in det space.
    cx = (1500 + 300 / 2) / det_w
    cy = (1000 + 400 / 2) / det_h
    assert abs(cx - 0.55) < 1e-9 and abs(cy - 0.6) < 1e-9, (cx, cy)
    print("  ✓ Payload passthrough verified!")


def test_faces_payload_legacy_fallback():
    print("\n[3] Testing faces payload fallback for legacy rows...")
    raw = [{"box": [3000, 2000, 600, 800], "is_vip": True}]
    faces, det_w, det_h = build_faces_payload(raw, {}, 9, 6000, 4000)
    assert len(faces) == 1
    assert faces[0]["det_width"] == 6000 and faces[0]["det_height"] == 4000
    assert faces[0]["is_vip"] is True
    assert (det_w, det_h) == (6000, 4000)
    # Legacy rows with no faces at all keep photo dims.
    faces_empty, ew, eh = build_faces_payload([], {}, 9, 6000, 4000)
    assert faces_empty == [] and (ew, eh) == (6000, 4000)
    print("  ✓ Legacy fallback verified!")


def test_faces_payload_vip_map():
    print("\n[4] Testing faces payload VIP mapping...")
    raw = [{"box": [10, 10, 50, 60]}, {"box": [100, 100, 50, 60]}]
    faces, _, _ = build_faces_payload(raw, {1: 42}, 3, 800, 600)
    assert faces[0]["is_vip"] is False and faces[0]["vip_id"] is None
    assert faces[1]["is_vip"] is True and faces[1]["vip_id"] == 42
    print("  ✓ VIP mapping verified!")


if __name__ == "__main__":
    test_face_detection_dims()
    test_faces_payload_passthrough()
    test_faces_payload_legacy_fallback()
    test_faces_payload_vip_map()
    print("\n==================================================")
    print("  ALL FACE ZOOM ALIGNMENT CHECKS VERIFIED! ✓")
    print("==================================================")
