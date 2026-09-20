"""
Detail & Flat-Lay Recognition
Evaluates ring shots, invitations, venue wide shots, and food differently than human subjects—
shifting focus algorithms to geometric symmetry, product sharpness, and texture clarity.
"""

import cv2
import numpy as np

def analyze_details(image: np.ndarray, face_count: int = 0) -> dict:
    """
    Detects if the frame is a detail/flat-lay/macro shot and evaluates its quality.
    """
    if face_count > 0:
        return {
            "is_detail_shot": False,
            "detail_type": None,
            "detail_score": 0.0,
            "symmetry_score": 0.0
        }

    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

    # 1. Edge & texture density (Laplacian & Sobel)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    edge_var = np.var(laplacian)

    # 2. Geometric Symmetry (horizontal and vertical mirror correlation)
    # Resize to manageable dimension for fast symmetry test
    small = cv2.resize(gray, (160, 160), interpolation=cv2.INTER_AREA)
    small_norm = (small - np.mean(small)) / (np.std(small) + 1e-6)

    # Horizontal flip symmetry (left-right reflection, common in venue wide & invitations)
    flipped_lr = np.fliplr(small_norm)
    lr_corr = np.mean(small_norm * flipped_lr)

    # 3. Center vs periphery focus (Macro detail indicator)
    # Macro ring/food shots typically have a sharp center with soft outer regions
    cy, cx = h // 2, w // 2
    r_h, r_w = h // 4, w // 4
    center_patch = gray[cy - r_h : cy + r_h, cx - r_w : cx + r_w]
    outer_var = edge_var
    center_var = np.var(cv2.Laplacian(center_patch, cv2.CV_64F)) if center_patch.size > 0 else 0

    is_macro = (center_var > outer_var * 1.4) and (center_var > 40.0)
    is_symmetric = lr_corr > 0.45
    
    # Check for flat-lay: high overall edge regularity and high symmetry
    is_flat_lay = is_symmetric and edge_var > 50.0

    is_detail = is_macro or is_flat_lay or (edge_var > 30.0 and face_count == 0)

    detail_type = None
    if is_macro:
        detail_type = "macro_product"
    elif is_flat_lay:
        detail_type = "flat_lay"
    elif is_symmetric:
        detail_type = "architecture_venue"
    elif is_detail:
        detail_type = "still_life"

    symmetry_score = max(0.0, min(100.0, float(lr_corr * 100.0)))
    # Micro-contrast sharpness score: 0 to 100
    sharpness_score = min(100.0, max(0.0, float(np.log1p(max(center_var, edge_var)) * 14.0)))

    detail_score = round(sharpness_score * 0.7 + symmetry_score * 0.3, 1)

    return {
        "is_detail_shot": bool(is_detail),
        "detail_type": detail_type,
        "detail_score": detail_score,
        "symmetry_score": round(symmetry_score, 1)
    }
