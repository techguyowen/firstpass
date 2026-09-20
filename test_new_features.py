"""
Test suite for new features:
1. Updater check logic
2. Burst clustering and Best Pick selection
3. Face Zoom Loupe bounding boxes
4. EXIF formatting
"""

import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import numpy as np
import cv2

from backend.routers.updater import _parse_semver, _is_newer
from backend.analyzer.duplicates import detect_burst_groups
from backend.analyzer.faces import analyze_faces
from backend.analyzer.pipeline import format_shutter, format_aperture, format_focal_length

def test_updater_logic():
    print("[1] Testing Updater Version Logic...")
    assert _parse_semver("v1.0.0") == (1, 0, 0)
    assert _parse_semver("1.2.3-beta") == (1, 2, 3)
    assert _is_newer("v1.1.0", "1.0.0") == True
    assert _is_newer("1.0.0", "1.0.0") == False
    assert _is_newer("0.9.9", "1.0.0") == False
    assert _is_newer("v2.0.0", "1.9.9") == True
    print("  ✓ Updater semver comparison passed!")

def test_burst_clustering():
    print("\n[2] Testing Burst Clustering & Best Pick Leader...")
    photos = [
        # Burst 1 (3 photos within 1.0s)
        {"id": 1, "folder": "/photos", "filename": "DSC_001.JPG", "exif_date": "2026:09:18 10:00:00", "overall_score": 60.0},
        {"id": 2, "folder": "/photos", "filename": "DSC_002.JPG", "exif_date": "2026:09:18 10:00:00", "overall_score": 88.5}, # WINNER
        {"id": 3, "folder": "/photos", "filename": "DSC_003.JPG", "exif_date": "2026:09:18 10:00:01", "overall_score": 72.0},
        
        # Single photo 2 minutes later
        {"id": 4, "folder": "/photos", "filename": "DSC_004.JPG", "exif_date": "2026:09:18 10:02:00", "overall_score": 80.0},
        
        # Burst 2 (2 photos within 0.5s)
        {"id": 5, "folder": "/photos", "filename": "DSC_005.JPG", "exif_date": "2026:09:18 10:05:00", "overall_score": 92.0}, # WINNER
        {"id": 6, "folder": "/photos", "filename": "DSC_006.JPG", "exif_date": "2026:09:18 10:05:01", "overall_score": 50.0},
    ]
    
    burst_map, burst_leaders = detect_burst_groups(photos, time_threshold_seconds=2.0)
    print("  Burst map:", burst_map)
    print("  Burst leaders (Best Picks):", burst_leaders)
    
    assert burst_map[1] == burst_map[2] == burst_map[3], "Photos 1, 2, 3 should be in same burst"
    assert 4 not in burst_map, "Photo 4 is standalone, should not be in a burst group"
    assert burst_map[5] == burst_map[6], "Photos 5 and 6 should be in same burst"
    assert 2 in burst_leaders, "Photo 2 should be the Best Pick leader for Burst 1"
    assert 5 in burst_leaders, "Photo 5 should be the Best Pick leader for Burst 2"
    print("  ✓ Burst clustering and Best Pick selection passed!")

def test_scene_chaptering():
    print("\n[3] Testing Chronological Scene / Chapter Detection...")
    from backend.analyzer.duplicates import detect_scenes
    photos = [
        # Chapter 1 (Morning ceremony)
        {"id": 1, "filename": "IMG_001.JPG", "exif_date": "2026:09:18 10:00:00"},
        {"id": 2, "filename": "IMG_002.JPG", "exif_date": "2026:09:18 10:05:00"},
        # 30 minute gap -> Chapter 2 (Reception)
        {"id": 3, "filename": "IMG_003.JPG", "exif_date": "2026:09:18 10:35:00"},
        {"id": 4, "filename": "IMG_004.JPG", "exif_date": "2026:09:18 10:40:00"},
    ]
    scene_map = detect_scenes(photos, gap_seconds=900.0) # 15 min gap
    assert scene_map[1][0] == scene_map[2][0], "Photos 1 & 2 belong to chapter 1"
    assert scene_map[3][0] == scene_map[4][0], "Photos 3 & 4 belong to chapter 2"
    assert scene_map[1][0] != scene_map[3][0], "Photos 1 and 3 belong to different chapters"
    print("  Scene 1:", scene_map[1][1])
    print("  Scene 2:", scene_map[3][1])
    print("  ✓ Scene chaptering verified!")

def test_bokeh_differentiation():
    print("\n[4] Testing Intentional Bokeh vs Camera Blur...")
    from backend.analyzer.blur import analyze_blur
    class DummySettings:
        blur_threshold = 30.0
    
    # Image with sharp center face and smooth blurred background (bokeh simulation)
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    # Add sharp high-frequency texture in face box [50, 50, 100, 100]
    img[50:150, 50:150] = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    
    face = {"box": [50, 50, 100, 100], "has_closed_eyes": False}
    res = analyze_blur(img, DummySettings(), detected_faces=[face])
    print(f"  Bokeh analysis result: is_bokeh={res.get('is_bokeh')}, blur_score={res.get('blur_score')}")
    assert res.get("is_bokeh") == True, "Should detect sharp subject with creamy background as intentional bokeh"
    assert res.get("is_blurry") == False, "Intentional bokeh must NOT be marked as blurry"
    print("  ✓ Intentional bokeh differentiation verified!")

def test_group_consistency():
    print("\n[5] Testing Group Consistency & Smile Scoring...")
    from backend.analyzer.faces import calculate_group_consistency
    # Perfect group: all open eyes and smiling
    faces_perfect = [
        {"has_closed_eyes": False, "is_smiling": True, "smile_score": 85.0},
        {"has_closed_eyes": False, "is_smiling": True, "smile_score": 90.0},
        {"has_closed_eyes": False, "is_smiling": True, "smile_score": 75.0}
    ]
    score_perf = calculate_group_consistency(faces_perfect)
    print(f"  Perfect group consistency: {score_perf}%")
    assert score_perf > 90.0

    # Ruined group: 2 people blinking, no one smiling
    faces_ruined = [
        {"has_closed_eyes": True, "is_smiling": False, "smile_score": 0.0},
        {"has_closed_eyes": True, "is_smiling": False, "smile_score": 0.0},
        {"has_closed_eyes": False, "is_smiling": False, "smile_score": 0.0}
    ]
    score_ruined = calculate_group_consistency(faces_ruined)
    print(f"  Ruined group consistency: {score_ruined}%")
    assert score_ruined < 40.0
    print("  ✓ Group consistency scoring verified!")

def test_face_loupe_data():
    print("\n[6] Testing Face Loupe Bounding Box Extraction...")
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    res = analyze_faces(img)
    assert "detected_faces" in res, "Should return detected_faces list"
    print(f"  Detected faces structure: {res['detected_faces']}")
    print("  ✓ Face Loupe structure verified!")

def test_exif_formatting():
    print("\n[7] Testing Shooting Parameter Formatters...")
    assert format_shutter(0.001) == "1/1000s"
    assert format_shutter(0.004) == "1/250s"
    assert format_shutter(2.0) == "2s"
    assert format_aperture(1.4) == "f/1.4"
    assert format_aperture(2.8) == "f/2.8"
    assert format_focal_length(85.0) == "85mm"
    print("  ✓ EXIF formatters verified!")

if __name__ == "__main__":
    test_updater_logic()
    test_burst_clustering()
    test_scene_chaptering()
    test_bokeh_differentiation()
    test_group_consistency()
    test_face_loupe_data()
    test_exif_formatting()
    print("\n==================================================")
    print("  ALL PRO AI CULLING FEATURES VERIFIED! ✓")
    print("==================================================")
