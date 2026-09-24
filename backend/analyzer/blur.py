import cv2
import numpy as np

def _calc_sharpness_score(v: float) -> float:
    if v <= 0:
        return 0.0
    # Non-saturating perceptual sharpness curve (calibrated across mobile & high-res cameras):
    # var < 15: blurry (< 35)
    # var 45-80: soft / low-frequency (52-60)
    # var 100-200: standard crisp handheld (64-75)
    # var 250-600: sharp portrait / good optics (78-88)
    # var 800-1500: tack-sharp prime lens (91-96)
    # var > 2000: exceptional micro-contrast (97-99)
    return float(100.0 * (1.0 - np.exp(-np.power(v, 0.42) / 6.8)))

def analyze_blur(image: np.ndarray, settings, detected_faces=None) -> dict:
    try:
        orig_h, orig_w = image.shape[:2]
        
        # Standardize scale to 1600px max dimension for resolution-independent Laplacian variance
        scale = 1.0
        if max(orig_h, orig_w) > 1600:
            scale = 1600.0 / max(orig_h, orig_w)
            target_w, target_h = int(orig_w * scale), int(orig_h * scale)
            work_image = cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_AREA)
        else:
            work_image = image

        if len(work_image.shape) == 3:
            gray = cv2.cvtColor(work_image, cv2.COLOR_BGR2GRAY)
        else:
            gray = work_image
            
        h, w = gray.shape[:2]
        
        # Whole-frame Laplacian variance on normalized image
        full_laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        
        is_bokeh = False
        effective_var = full_laplacian_var
        
        # 1. Subject vs Background (Intentional Bokeh / Shallow DoF detection)
        enable_bokeh = getattr(settings, "enable_bokeh_detection", True)
        if detected_faces and len(detected_faces) > 0:
            face_boxes_var = []
            for f in detected_faces:
                # If sharpness was already computed in analyze_faces, we can use it
                f_sharp = f.get("sharpness")
                if f_sharp and f_sharp > 0:
                    face_boxes_var.append(float(f_sharp))
                else:
                    box = f.get("box", [])
                    if len(box) == 4:
                        bx, by, bw, bh = box
                        # Map box from original coords to current work_image scale
                        sbx, sby = int(bx * scale), int(by * scale)
                        sbw, sbh = int(bw * scale), int(bh * scale)
                        face_crop = gray[max(0, sby):min(h, sby+sbh), max(0, sbx):min(w, sbx+sbw)]
                        if face_crop.size > 50:
                            face_boxes_var.append(float(cv2.Laplacian(face_crop, cv2.CV_64F).var()))
            
            if face_boxes_var:
                subject_var = max(face_boxes_var)
                # If subject face is sharp but full frame is softer (creamy bokeh background)
                if enable_bokeh and subject_var > 45.0 and full_laplacian_var < subject_var * 0.8:
                    is_bokeh = True
                    effective_var = subject_var * 0.90 + full_laplacian_var * 0.10
                else:
                    effective_var = max(full_laplacian_var, subject_var)
        else:
            # Check center salient region (common subject location)
            cy, cx = h // 2, w // 2
            center_patch = gray[max(0, cy - h//4):min(h, cy + h//4), max(0, cx - w//4):min(w, cx + w//4)]
            if center_patch.size > 100:
                center_var = float(cv2.Laplacian(center_patch, cv2.CV_64F).var())
                if enable_bokeh and center_var > 60.0 and full_laplacian_var < center_var * 0.75:
                    is_bokeh = True
                    effective_var = center_var * 0.85 + full_laplacian_var * 0.15
                else:
                    effective_var = max(full_laplacian_var, center_var * 0.9)
        
        # 2. Directional Motion Blur & Intentional Motion (Panning / Dragged Shutter vs Jitter)
        enable_shake = getattr(settings, "enable_camera_shake", True)
        has_motion_blur = False
        is_motion_intentional = False
        motion_type = None

        sobel_x = float(cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3).var())
        sobel_y = float(cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3).var())
        axis_ratio = max(sobel_x, sobel_y) / max(1.0, min(sobel_x, sobel_y))

        # Check if subject is sharp
        subject_is_crisp = effective_var >= 45.0

        if enable_shake and axis_ratio > 3.0:
            if subject_is_crisp:
                # Strong directional blur in background + crisp subject = ARTISTIC PANNING
                is_motion_intentional = True
                motion_type = "panning"
            elif effective_var < 30.0:
                # Smeared throughout without crisp anchor = CAMERA SHAKE
                has_motion_blur = True
                motion_type = "camera_shake"

        # Scale the score using calibrated perception curve
        learned_blur = getattr(settings, "learned_blur_bias", 0.0) if getattr(settings, "enable_preference_learning", True) else 0.0
        threshold = getattr(settings, "blur_threshold", 30.0) + learned_blur
        blur_score = _calc_sharpness_score(effective_var)
        
        # If bokeh is confirmed, award a proportional aesthetic focus bonus without hard saturation
        if is_bokeh and enable_bokeh:
            blur_score = blur_score + (100.0 - blur_score) * 0.15

        # If intentional artistic panning detected, award an artistic bonus instead of penalizing
        if is_motion_intentional:
            blur_score = min(100.0, max(blur_score, 75.0) + 10.0)
            has_motion_blur = False
        elif has_motion_blur:
            # Severe camera jitter penalty
            blur_score = max(0.0, blur_score - 20.0)
            
        if not enable_bokeh:
            is_bokeh = False
        is_blurry = blur_score < threshold and not is_motion_intentional and not (is_bokeh and enable_bokeh)
        
        return {
            "blur_score": round(float(blur_score), 1),
            "is_blurry": bool(is_blurry),
            "is_bokeh": bool(is_bokeh),
            "has_motion_blur": bool(has_motion_blur),
            "is_motion_intentional": bool(is_motion_intentional),
            "motion_type": motion_type
        }
    except Exception as e:
        print(f"Error in analyze_blur: {e}")
        return {
            "blur_score": 50.0,
            "is_blurry": False,
            "is_bokeh": False,
            "has_motion_blur": False,
            "is_motion_intentional": False,
            "motion_type": None
        }
