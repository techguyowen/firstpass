import cv2
import numpy as np
import os
import sys
import threading
from typing import Optional, List, Dict
from scipy.spatial import distance as dist

try:
    import dlib
except ImportError:
    dlib = None

# Paths for models
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models_data")
PREDICTOR_PATH = os.path.join(MODELS_DIR, "shape_predictor_68_face_landmarks.dat")

def get_cascade_path(filename: str) -> str:
    """Finds Haar cascade XML files in bundled PyInstaller or dev environments."""
    if hasattr(sys, '_MEIPASS'):
        p = os.path.join(sys._MEIPASS, 'cv2', 'data', filename)
        if os.path.exists(p):
            return p
    exe_dir = os.path.dirname(sys.executable)
    for sub in ['_internal/cv2/data', 'cv2/data', 'models_data']:
        p = os.path.join(exe_dir, sub, filename)
        if os.path.exists(p):
            return p
    try:
        if hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades'):
            p = os.path.join(cv2.data.haarcascades, filename)
            if os.path.exists(p):
                return p
    except Exception:
        pass
    return filename

def get_yunet_path() -> Optional[str]:
    """Finds YuNet ONNX face detection model in bundled PyInstaller or dev environments."""
    filename = "face_detection_yunet_2023mar.onnx"
    candidates = []
    if hasattr(sys, '_MEIPASS'):
        candidates.append(os.path.join(sys._MEIPASS, 'models_data', filename))
        candidates.append(os.path.join(sys._MEIPASS, filename))
    exe_dir = os.path.dirname(sys.executable)
    candidates.extend([
        os.path.join(exe_dir, 'models_data', filename),
        os.path.join(exe_dir, '_internal', 'models_data', filename),
        os.path.join(exe_dir, '..', 'models_data', filename)
    ])
    candidates.extend([
        os.path.join(os.path.dirname(__file__), '..', 'models_data', filename),
        os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'models_data', filename),
        os.path.join(os.getcwd(), 'backend', 'models_data', filename)
    ])
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

# Thread-local storage for OpenCV classifiers and YuNet to guarantee thread safety
_thread_local = threading.local()

def get_thread_classifiers():
    if not hasattr(_thread_local, 'initialized'):
        # High precision YuNet Deep Learning face detector (ONNX)
        _thread_local.yunet_detector = None
        if hasattr(cv2, 'FaceDetectorYN'):
            yp = get_yunet_path()
            if yp and os.path.exists(yp):
                try:
                    _thread_local.yunet_detector = cv2.FaceDetectorYN.create(
                        yp,
                        '',
                        (320, 320),
                        score_threshold=0.65,
                        nms_threshold=0.3,
                        top_k=5000
                    )
                except Exception as e:
                    print(f"Failed to load FaceDetectorYN: {e}")

        # Fallback Haar Cascades (using alt2 which has dramatically fewer false positives than default)
        alt2_path = get_cascade_path('haarcascade_frontalface_alt2.xml')
        if not os.path.exists(alt2_path):
            alt2_path = get_cascade_path('haarcascade_frontalface_default.xml')
        _thread_local.face_cascade = cv2.CascadeClassifier(alt2_path)
        _thread_local.profile_cascade = cv2.CascadeClassifier(get_cascade_path('haarcascade_profileface.xml'))
        _thread_local.eye_cascade = cv2.CascadeClassifier(get_cascade_path('haarcascade_eye.xml'))
        _thread_local.smile_cascade = cv2.CascadeClassifier(get_cascade_path('haarcascade_smile.xml'))
        
        # dlib detector (if installed)
        _thread_local.face_detector = None
        _thread_local.shape_predictor = None
        if dlib is not None:
            try:
                _thread_local.face_detector = dlib.get_frontal_face_detector()
                if os.path.exists(PREDICTOR_PATH):
                    _thread_local.shape_predictor = dlib.shape_predictor(PREDICTOR_PATH)
            except Exception as e:
                print(f"Failed to load dlib in thread: {e}")
                
        _thread_local.initialized = True
        
    return _thread_local

def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    ear = (A + B) / (2.0 * C)
    return ear

def calculate_group_consistency(detected_faces: list) -> Optional[float]:
    face_count = len(detected_faces)
    if face_count == 0:
        return None
    open_count = sum(1 for f in detected_faces if not f.get("has_closed_eyes", False))
    smile_count = sum(1 for f in detected_faces if f.get("is_smiling", False))
    if face_count >= 2:
        open_ratio = open_count / face_count
        smile_ratio = smile_count / face_count
        return round((open_ratio * 0.7 + smile_ratio * 0.3) * 100.0, 1)
    else:
        has_closed = any(f.get("has_closed_eyes", False) for f in detected_faces)
        return 0.0 if has_closed else 100.0

def _box_iou(b1, b2):
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[0] + b1[2], b2[0] + b2[2])
    y2 = min(b1[1] + b1[3], b2[1] + b2[3])
    w = max(0, x2 - x1)
    h = max(0, y2 - y1)
    inter = w * h
    union = b1[2] * b1[3] + b2[2] * b2[3] - inter
    return inter / union if union > 0 else 0

def analyze_faces(image: np.ndarray) -> dict:
    t = get_thread_classifiers()
    
    try:
        orig_h, orig_w = image.shape[:2]
        
        # Scale to max 1600px for robust inference speed and scale invariance
        scale = 1.0
        if max(orig_h, orig_w) > 1600:
            scale = 1600.0 / max(orig_h, orig_w)
            target_w, target_h = int(orig_w * scale), int(orig_h * scale)
            work_image = cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_AREA)
        else:
            work_image = image
            target_w, target_h = orig_w, orig_h

        gray = cv2.cvtColor(work_image, cv2.COLOR_BGR2GRAY) if len(work_image.shape) == 3 else work_image
        
        has_closed_eyes = False
        detected_faces = []
        total_smile_score = 0.0
        inv_scale = 1.0 / scale
        
        # =========================================================================
        # 1. State-of-the-Art Deep Learning Face Detection: OpenCV YuNet
        # =========================================================================
        if t.yunet_detector is not None:
            t.yunet_detector.setInputSize((target_w, target_h))
            _, raw_faces = t.yunet_detector.detect(work_image)
            
            if raw_faces is not None and len(raw_faces) > 0:
                for f in raw_faces:
                    fx, fy, fw, fh = float(f[0]), float(f[1]), float(f[2]), float(f[3])
                    re_x, re_y = float(f[4]), float(f[5])   # subject's right eye
                    le_x, le_y = float(f[6]), float(f[7])   # subject's left eye
                    rm_x, rm_y = float(f[10]), float(f[11]) # right mouth corner
                    lm_x, lm_y = float(f[12]), float(f[13]) # left mouth corner
                    conf = float(f[14])
                    
                    # Filter out tiny specks (<24px) or low confidence
                    if fw < 24 or fh < 24 or conf < 0.65:
                        continue
                    
                    ipd = float(np.hypot(le_x - re_x, le_y - re_y))
                    
                    # Geometric guard for borderline detections (0.65–0.75):
                    # Real faces (even in extreme profile) have ipd >= 5% of face height.
                    # Ear crops, bokeh blobs, and non-face artifacts fail this test.
                    if conf < 0.75 and (ipd / max(1.0, fh)) < 0.05:
                        continue
                        

                    mw = float(np.hypot(lm_x - rm_x, lm_y - rm_y))
                    mouth_ratio = mw / max(1.0, ipd)
                    
                    is_smiling = mouth_ratio > 0.82
                    smile_score = min(100.0, max(0.0, (mouth_ratio - 0.70) * 250.0)) if is_smiling else 0.0
                    total_smile_score += smile_score
                    
                    # Candid peak detection: laughing squint vs sleepy blink
                    is_candid_peak = (mouth_ratio > 0.95) and is_smiling
                    
                    # Eye openness check via vertical gradient variance
                    closed = False
                    if ipd >= 14:
                        ew = max(4, int(ipd * 0.20))
                        eh = max(3, int(ipd * 0.12))
                        re_patch = gray[max(0, int(re_y - eh)):min(target_h, int(re_y + eh)), max(0, int(re_x - ew)):min(target_w, int(re_x + ew))]
                        le_patch = gray[max(0, int(le_y - eh)):min(target_h, int(le_y + eh)), max(0, int(le_x - ew)):min(target_w, int(le_x + ew))]
                        
                        re_sobel = float(cv2.Sobel(re_patch, cv2.CV_64F, 0, 1, ksize=3).var()) if re_patch.size > 16 else 1000.0
                        le_sobel = float(cv2.Sobel(le_patch, cv2.CV_64F, 0, 1, ksize=3).var()) if le_patch.size > 16 else 1000.0
                        avg_sobel = (re_sobel + le_sobel) / 2.0
                        
                        if avg_sobel < 160.0 and not is_candid_peak:
                            closed = True
                            has_closed_eyes = True
                            
                    # Sharpness of face region
                    ix, iy, iw, ih = int(fx), int(fy), int(fw), int(fh)
                    face_roi = gray[max(0, iy):min(target_h, iy + ih), max(0, ix):min(target_w, ix + iw)]
                    face_var = float(cv2.Laplacian(face_roi, cv2.CV_64F).var()) if face_roi.size > 0 else 0.0
                    
                    orig_box = [int(ix * inv_scale), int(iy * inv_scale), int(iw * inv_scale), int(ih * inv_scale)]
                    
                    detected_faces.append({
                        "box": orig_box,
                        "has_closed_eyes": closed,
                        "is_smiling": is_smiling,
                        "smile_score": round(smile_score, 1),
                        "sharpness": round(face_var, 1),
                        "is_candid_peak": is_candid_peak,
                        "confidence": round(conf, 2)
                    })

        # =========================================================================
        # 2. dlib HOG detector path (if YuNet unavailable)
        # =========================================================================
        elif t.face_detector is not None:
            dlib_scale = 1.0
            if max(gray.shape) > 1000:
                dlib_scale = 1000.0 / max(gray.shape)
                gray_small = cv2.resize(gray, (0, 0), fx=dlib_scale, fy=dlib_scale)
            else:
                gray_small = gray
                
            rects = t.face_detector(gray_small, 1)
            
            if t.shape_predictor and len(rects) > 0:
                for rect in rects:
                    left = int(rect.left() / dlib_scale)
                    top = int(rect.top() / dlib_scale)
                    right = int(rect.right() / dlib_scale)
                    bottom = int(rect.bottom() / dlib_scale)
                    w = max(1, right - left)
                    h = max(1, bottom - top)
                    
                    original_rect = dlib.rectangle(left, top, right, bottom)
                    shape = t.shape_predictor(gray, original_rect)
                    
                    coords = np.zeros((68, 2), dtype=int)
                    for i in range(0, 68):
                        coords[i] = (shape.part(i).x, shape.part(i).y)
                        
                    leftEye = coords[36:42]
                    rightEye = coords[42:48]
                    
                    leftEAR = eye_aspect_ratio(leftEye)
                    rightEAR = eye_aspect_ratio(rightEye)
                    ear = (leftEAR + rightEAR) / 2.0
                    
                    mouth_width = dist.euclidean(coords[48], coords[54])
                    mouth_height = dist.euclidean(coords[51], coords[57])
                    ratio = mouth_width / max(1.0, mouth_height)
                    is_smiling = ratio > 2.2
                    smile_score = min(100.0, max(0.0, (ratio - 1.5) * 60.0)) if is_smiling else 0.0
                    total_smile_score += smile_score

                    is_candid_peak = (mouth_height > 14.0 or ratio > 2.5) and is_smiling
                    closed = ear < 0.20 and not is_candid_peak
                    if closed:
                        has_closed_eyes = True
                    
                    face_roi = gray[max(0, top):min(gray.shape[0], top+h), max(0, left):min(gray.shape[1], left+w)]
                    face_var = float(cv2.Laplacian(face_roi, cv2.CV_64F).var()) if face_roi.size > 0 else 0.0
                    
                    orig_box = [int(left * inv_scale), int(top * inv_scale), int(w * inv_scale), int(h * inv_scale)]
                    
                    detected_faces.append({
                        "box": orig_box,
                        "has_closed_eyes": closed,
                        "is_smiling": is_smiling,
                        "smile_score": round(smile_score, 1),
                        "sharpness": round(face_var, 1),
                        "is_candid_peak": is_candid_peak
                    })

        # =========================================================================
        # 3. High-Precision Haar Cascade Fallback
        # =========================================================================
        elif t.face_cascade is not None and not t.face_cascade.empty():
            raw_boxes = []
            
            # Using minNeighbors=6 to eliminate background false positives
            frontal = t.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=6,
                minSize=(32, 32),
                flags=cv2.CASCADE_SCALE_IMAGE
            )
            if len(frontal) > 0:
                raw_boxes.extend(list(frontal))
            elif t.profile_cascade is not None and not t.profile_cascade.empty():
                # Only check profiles if no frontal faces found, with high neighbor threshold
                profiles = t.profile_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=7,
                    minSize=(36, 36),
                    flags=cv2.CASCADE_SCALE_IMAGE
                )
                if len(profiles) > 0:
                    raw_boxes.extend(list(profiles))
            
            for (x, y, w, h) in raw_boxes:
                closed = False
                if t.eye_cascade is not None and not t.eye_cascade.empty():
                    roi_eyes = gray[y:y + int(h * 0.55), x:x + w]
                    if roi_eyes.size > 100:
                        eyes = t.eye_cascade.detectMultiScale(roi_eyes, scaleFactor=1.1, minNeighbors=4, minSize=(16, 16))
                        if len(eyes) >= 1:
                            for (ex, ey, ew, eh) in eyes:
                                if eh > 0 and (ew / eh) > 2.8:
                                    closed = True
                                    has_closed_eyes = True
                
                is_smiling = False
                smile_score = 0.0
                if t.smile_cascade is not None and not t.smile_cascade.empty():
                    roi_mouth = gray[y + int(h * 0.5):y + h, x:x + w]
                    if roi_mouth.size > 100:
                        smiles = t.smile_cascade.detectMultiScale(roi_mouth, scaleFactor=1.6, minNeighbors=14, minSize=(18, 18))
                        if len(smiles) > 0:
                            is_smiling = True
                            smile_score = min(100.0, 50.0 + len(smiles) * 20.0)
                total_smile_score += smile_score
                
                face_roi = gray[y:y+h, x:x+w]
                face_var = float(cv2.Laplacian(face_roi, cv2.CV_64F).var()) if face_roi.size > 0 else 0.0
                
                orig_box = [int(x * inv_scale), int(y * inv_scale), int(w * inv_scale), int(h * inv_scale)]
                
                detected_faces.append({
                    "box": orig_box,
                    "has_closed_eyes": closed,
                    "is_smiling": is_smiling,
                    "smile_score": round(smile_score, 1),
                    "sharpness": round(face_var, 1),
                    "is_candid_peak": False
                })

        # =========================================================================
        # 4. Subject Hierarchy: Prioritize VIPs over distant bystanders
        # =========================================================================
        vip_closed_eyes = False
        if detected_faces:
            max_area = max(f["box"][2] * f["box"][3] for f in detected_faces)
            for f in detected_faces:
                area = f["box"][2] * f["box"][3]
                # A face is a primary VIP if it is at least 35% of the largest face
                is_vip = area >= max_area * 0.35
                f["is_vip"] = is_vip
                if is_vip and f.get("has_closed_eyes", False):
                    vip_closed_eyes = True

        group_consistency_score = calculate_group_consistency(detected_faces)
        avg_smile_score = round(total_smile_score / max(1, len(detected_faces)), 1) if detected_faces else 0.0
            
        return {
            "face_count": len(detected_faces),
            "has_closed_eyes": vip_closed_eyes if detected_faces else has_closed_eyes,
            "raw_has_closed_eyes": has_closed_eyes,
            "smile_score": avg_smile_score,
            "group_consistency_score": group_consistency_score,
            "detected_faces": detected_faces
        }
    except Exception as e:
        print(f"Error in analyze_faces: {e}")
        return {
            "face_count": 0,
            "has_closed_eyes": False,
            "smile_score": 0.0,
            "group_consistency_score": None,
            "detected_faces": []
        }
