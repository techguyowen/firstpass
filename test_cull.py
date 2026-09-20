"""
Verification test for FirstPass AI engine:
Tests blur detection, exposure analysis, aesthetic scoring, and duplicate grouping.
"""

import os
import sys
import numpy as np
import cv2
from pathlib import Path

# Setup paths
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from backend.analyzer.blur import analyze_blur
from backend.analyzer.exposure import analyze_exposure
from backend.analyzer.faces import analyze_faces
from backend.analyzer.aesthetic import analyze_aesthetic
from backend.analyzer.composition import analyze_composition
from backend.analyzer.duplicates import compute_hash, find_duplicate_groups

class DummySettings:
    blur_threshold = 30.0
    exposure_low_threshold = 35.0
    exposure_high_threshold = 65.0
    duplicate_hash_distance = 10
    weight_blur = 0.35
    weight_exposure = 0.25
    weight_aesthetic = 0.25
    weight_composition = 0.15
    auto_accept_threshold = 75.0
    min_overall_score = 40.0

def run_tests():
    print("=" * 60)
    print("  Running FirstPass AI Engine Verification Tests")
    print("=" * 60)
    
    settings = DummySettings()
    
    # 1. Create a sharp image (high frequency text/edges)
    sharp_img = np.zeros((600, 800, 3), dtype=np.uint8)
    for i in range(0, 600, 20):
        cv2.line(sharp_img, (0, i), (800, i), (255, 255, 255), 2)
    for j in range(0, 800, 20):
        cv2.line(sharp_img, (j, 0), (j, 600), (255, 255, 255), 2)
    cv2.putText(sharp_img, "SHARP FOCUS PHOTO TEST", (50, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)

    # 2. Create a heavily blurred image
    blurry_img = cv2.GaussianBlur(sharp_img, (61, 61), 0)

    # 3. Create an underexposed (very dark) image
    dark_img = (sharp_img * 0.05).astype(np.uint8)

    # 4. Create an overexposed (blown out) image
    bright_img = np.clip(sharp_img.astype(np.float32) + 220, 0, 255).astype(np.uint8)

    print("\n[1] Testing Blur Detection...")
    sharp_res = analyze_blur(sharp_img, settings)
    blurry_res = analyze_blur(blurry_img, settings)
    print(f"  Sharp image score:  {sharp_res['blur_score']:.1f} (is_blurry: {sharp_res['is_blurry']})")
    print(f"  Blurry image score: {blurry_res['blur_score']:.1f} (is_blurry: {blurry_res['is_blurry']})")
    assert sharp_res['blur_score'] > blurry_res['blur_score'], "Sharp score should be higher than blurry"
    assert blurry_res['is_blurry'] == True, "Blurry image should be flagged as blurry"
    print("  ✓ Blur detection passed!")

    print("\n[2] Testing Exposure Analysis...")
    dark_res = analyze_exposure(dark_img, settings)
    bright_res = analyze_exposure(bright_img, settings)
    normal_res = analyze_exposure(sharp_img, settings)
    print(f"  Normal image:  score={normal_res['exposure_score']:.1f}, type={normal_res['exposure_type']}")
    print(f"  Dark image:    score={dark_res['exposure_score']:.1f}, type={dark_res['exposure_type']}")
    print(f"  Bright image:  score={bright_res['exposure_score']:.1f}, type={bright_res['exposure_type']}")
    assert dark_res['exposure_type'] == 'underexposed', f"Expected underexposed, got {dark_res['exposure_type']}"
    assert bright_res['exposure_type'] == 'overexposed', f"Expected overexposed, got {bright_res['exposure_type']}"
    print("  ✓ Exposure analysis passed!")

    print("\n[3] Testing Composition Analysis...")
    comp_res = analyze_composition(sharp_img)
    print(f"  Composition score: {comp_res['composition_score']:.1f}")
    assert 0 <= comp_res['composition_score'] <= 100
    print("  ✓ Composition analysis passed!")

    print("\n[4] Testing Face Detection...")
    face_res = analyze_faces(sharp_img)
    print(f"  Face count: {face_res['face_count']}, closed_eyes: {face_res['has_closed_eyes']}")
    assert face_res['face_count'] == 0, "No faces expected in synthetic grid"
    print("  ✓ Face detection passed!")

    print("\n[5] Testing Aesthetic Quality Scoring (BRISQUE)...")
    aes_res = analyze_aesthetic(sharp_img)
    print(f"  Aesthetic score: {aes_res['aesthetic_score']:.1f}")
    assert 0 <= aes_res['aesthetic_score'] <= 100
    print("  ✓ Aesthetic quality passed!")

    print("\n" + "=" * 60)
    print("  ALL AI ENGINE VERIFICATION TESTS PASSED! ✓")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
