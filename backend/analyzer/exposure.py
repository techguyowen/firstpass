import cv2
import numpy as np

def analyze_exposure(image: np.ndarray, settings, detected_faces=None, filename: str = "") -> dict:
    try:
        # Convert to LAB color space and get L channel
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l_channel = lab[:,:,0]
        else:
            l_channel = image
            
        # Calculate mean brightness
        mean_brightness = float(np.mean(l_channel))
        
        # Detect highlight and shadow clipping
        pixels_total = max(1, l_channel.shape[0] * l_channel.shape[1])
        crushed_shadows = float(np.sum(l_channel < 15) / pixels_total)
        blown_highlights = float(np.sum(l_channel > 245) / pixels_total)
        
        dark_pixels = np.sum(l_channel < 30)
        bright_pixels = np.sum(l_channel > 225)
        dark_ratio = float(dark_pixels / pixels_total)
        bright_ratio = float(bright_pixels / pixels_total)
        
        # Face skin-tone luminance check if faces are detected
        face_l_mean = None
        if detected_faces and len(detected_faces) > 0:
            face_means = []
            h, w = l_channel.shape[:2]
            for f in detected_faces:
                box = f.get("box", [])
                if len(box) == 4:
                    bx, by, bw, bh = box
                    face_roi = l_channel[max(0, by):min(h, by+bh), max(0, bx):min(w, bx+bw)]
                    if face_roi.size > 0:
                        face_means.append(float(np.mean(face_roi)))
            if face_means:
                face_l_mean = float(np.mean(face_means))
                
        # Detect Event & Stage Lighting (Colored Gels, Backlight, Theatrical Spotlight, Low-Key Portraits, Night)
        lighting_type = "standard"
        is_night_scene = "night" in filename.lower()

        if len(image.shape) == 3:
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            sat = hsv[:, :, 1]
            bright_mask = l_channel > 80
            high_sat_in_bright = float(np.mean(sat[bright_mask])) if np.any(bright_mask) else 0.0
            
            # Theatrical colored gels (e.g. purple/cyan/red stage lights)
            if high_sat_in_bright > 115.0:
                lighting_type = "colored_gels"
            # Backlit / Stage Rim Lighting (dark foreground with bright rim/spotlight)
            elif dark_ratio > 0.4 and blown_highlights > 0.04 and np.std(l_channel) > 65.0:
                lighting_type = "stage_backlight"
            # Low-Key / Evening Portrait: dark background but human faces are properly illuminated
            elif (dark_ratio > 0.35 or crushed_shadows > 0.20 or is_night_scene) and (face_l_mean is not None and face_l_mean >= 85.0):
                lighting_type = "low_key_portrait"
            # Night Scene: intentional night capture without face underexposure
            elif is_night_scene and (face_l_mean is None or face_l_mean >= 75.0):
                lighting_type = "night_scene"
            elif np.std(l_channel) > 75.0 and (crushed_shadows > 0.25 or blown_highlights > 0.05):
                lighting_type = "high_contrast"

        # Determine exposure type & score
        exposure_type = 'good'
        if lighting_type in ("colored_gels", "stage_backlight"):
            # Theatrical lighting intentionally has high dynamic contrast
            exposure_type = 'good'
            exposure_score = max(75.0, 100.0 - (abs(mean_brightness - 110.0) / 110.0 * 30.0))
        elif lighting_type in ("low_key_portrait", "night_scene"):
            exposure_type = 'good'
            if face_l_mean is not None:
                # Score based on subject face illumination: ideal skin luminance is 110-150
                diff = abs(face_l_mean - 125.0)
                exposure_score = max(70.0, 95.0 - (diff / 125.0 * 35.0))
                if blown_highlights > 0.08:
                    exposure_score = max(50.0, exposure_score - 15.0)
            else:
                exposure_score = max(70.0, 85.0 - (abs(mean_brightness - 60.0) / 60.0 * 20.0))
        elif face_l_mean is not None:
            if face_l_mean < 70.0 or (face_l_mean < 80.0 and crushed_shadows > 0.35):
                exposure_type = 'underexposed'
            elif face_l_mean > 200.0 or blown_highlights > 0.15:
                exposure_type = 'overexposed'
                
            # Base on face luminance primarily, ambient secondarily
            face_score = max(0.0, 100.0 - (abs(face_l_mean - 127.5) / 127.5 * 60.0))
            ambient_score = max(0.0, 100.0 - (abs(mean_brightness - 127.5) / 127.5 * 40.0))
            exposure_score = face_score * 0.70 + ambient_score * 0.30
            
            if blown_highlights > 0.08:
                exposure_score = max(0.0, exposure_score - (blown_highlights * 50.0))
            if crushed_shadows > 0.25 and face_l_mean < 95.0:
                exposure_score = max(0.0, exposure_score - (crushed_shadows * 30.0))
        else:
            if mean_brightness < settings.exposure_low_threshold or dark_ratio > 0.4:
                exposure_type = 'underexposed'
            elif mean_brightness > (255 - settings.exposure_high_threshold) or bright_ratio > 0.4:
                exposure_type = 'overexposed'
            deviation = abs(mean_brightness - 127.5)
            exposure_score = max(0.0, 100.0 - (deviation / 127.5 * 100.0))
            if blown_highlights > 0.08:
                exposure_score = max(0.0, exposure_score - (blown_highlights * 60.0))
            if crushed_shadows > 0.20:
                exposure_score = max(0.0, exposure_score - (crushed_shadows * 40.0))

        return {
            "exposure_score": round(float(max(0.0, min(100.0, exposure_score))), 1),
            "exposure_type": exposure_type,
            "mean_brightness": round(mean_brightness, 1),
            "lighting_type": lighting_type
        }
    except Exception as e:
        print(f"Error in analyze_exposure: {e}")
        return {
            "exposure_score": 50.0,
            "exposure_type": "good",
            "mean_brightness": 128.0,
            "lighting_type": "standard"
        }
