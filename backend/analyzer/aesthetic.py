import os
import sys
import threading
import torch
import numpy as np
import cv2
from typing import Optional
from .gpu import get_device

# Load model globally to cache it
brisque_metric = None
_model_lock = threading.Lock()

def get_brisque_weights_path() -> Optional[str]:
    """Resolves path to brisque_svm_weights.pth across dev and PyInstaller frozen bundle."""
    if hasattr(sys, '_MEIPASS'):
        p = os.path.join(sys._MEIPASS, 'models_data', 'brisque_svm_weights.pth')
        if os.path.exists(p):
            return p
    exe_dir = os.path.dirname(sys.executable)
    for sub in ['_internal/models_data', 'models_data']:
        p = os.path.join(exe_dir, sub, 'brisque_svm_weights.pth')
        if os.path.exists(p):
            return p
    dev_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "models_data", "brisque_svm_weights.pth"))
    if os.path.exists(dev_path):
        return dev_path
    return None

def load_brisque():
    global brisque_metric
    if brisque_metric is None:
        with _model_lock:
            if brisque_metric is None:
                try:
                    from pyiqa.archs.brisque_arch import BRISQUE
                    weights_path = get_brisque_weights_path()
                    device = torch.device(get_device())
                    if weights_path and os.path.exists(weights_path):
                        model = BRISQUE(pretrained_model_path=weights_path)
                    else:
                        model = BRISQUE()
                    model.to(device)
                    model.eval()
                    brisque_metric = model
                except Exception as e:
                    print(f"Failed to load BRISQUE model: {e}")
                    brisque_metric = False # Mark as failed

def analyze_aesthetic(image: np.ndarray) -> dict:
    try:
        load_brisque()
        if not brisque_metric:
            return {"aesthetic_score": 50.0}
            
        # Scale to max 1200px for consistent, fast aesthetic evaluation
        h, w = image.shape[:2]
        if max(h, w) > 1200:
            scale = 1200.0 / max(h, w)
            work_image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        else:
            work_image = image

        # pyiqa expects RGB tensor (B,C,H,W) in 0-1 range
        img_rgb = cv2.cvtColor(work_image, cv2.COLOR_BGR2RGB)
        img_tensor = torch.from_numpy(img_rgb).float() / 255.0
        img_tensor = img_tensor.permute(2, 0, 1).unsqueeze(0) # (1, 3, H, W)
        
        device = torch.device(get_device())
        img_tensor = img_tensor.to(device)
        
        with _model_lock:
            with torch.no_grad():
                raw_score = brisque_metric(img_tensor).item()
            
        # BRISQUE score: SVR on natural scene statistics.
        # Raw scores range from ~ -30 (pristine/superb) to +35+ (heavily degraded/compressed).
        # Calibrate smoothly so scores spread naturally across 60-99 without artificial clamping:
        # raw -30 -> ~99.0 (studio/RAW perfection)
        # raw   0 -> ~85.0 (clean crisp DSLR/mobile)
        # raw  15 -> ~75.0 (normal mobile snap)
        # raw  30 -> ~65.0 (social media / compressed)
        calibrated_score = 85.0 - (raw_score * 0.65)
        final_score = round(float(max(10.0, min(99.0, calibrated_score))), 1)
        
        return {
            "aesthetic_score": final_score
        }
    except Exception as e:
        print(f"Error in analyze_aesthetic: {e}")
        return {"aesthetic_score": 50.0}
