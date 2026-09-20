import cv2
import numpy as np

def analyze_composition(image: np.ndarray, detected_faces=None) -> dict:
    try:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
            
        h, w = gray.shape[:2]
        edges = cv2.Canny(gray, 100, 200)
        
        # 1. Rule of Thirds alignment
        third_h, third_w = h // 3, w // 3
        h1_start, h1_end = max(0, third_h - 15), min(h, third_h + 15)
        h2_start, h2_end = max(0, 2 * third_h - 15), min(h, 2 * third_h + 15)
        v1_start, v1_end = max(0, third_w - 15), min(w, third_w + 15)
        v2_start, v2_end = max(0, 2 * third_w - 15), min(w, 2 * third_w + 15)
        
        score_edges = (
            np.sum(edges[h1_start:h1_end, :]) +
            np.sum(edges[h2_start:h2_end, :]) +
            np.sum(edges[:, v1_start:v1_end]) +
            np.sum(edges[:, v2_start:v2_end])
        )
        total_edges = max(1, np.sum(edges))
        thirds_ratio = score_edges / total_edges
        thirds_score = min(100.0, 50.0 + (thirds_ratio * 160.0))

        # 2. Leading Lines (Hough transform)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=min(h, w) // 5, maxLineGap=20)
        has_leading_lines = False
        diagonal_lines_count = 0
        if lines is not None and len(lines) > 0:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180.0 / np.pi)
                # Diagonal leading lines (between 25 and 65 degrees)
                if 25.0 <= angle <= 65.0 or 115.0 <= angle <= 155.0:
                    diagonal_lines_count += 1
            has_leading_lines = diagonal_lines_count >= 2

        # 3. Headroom & Subject Framing (if human faces present)
        has_good_headroom = True
        if detected_faces and len(detected_faces) > 0:
            topmost_face_y = min(f["box"][1] for f in detected_faces)
            headroom_pct = (topmost_face_y / h) * 100.0
            # Ideal headroom is between 5% and 22% of frame height
            if headroom_pct < 2.0 or headroom_pct > 35.0:
                has_good_headroom = False

        # 4. Negative Space Ratio (fraction of clean, breathing space)
        small_gray = cv2.resize(gray, (100, 100))
        grad_mag = cv2.Sobel(small_gray, cv2.CV_32F, 1, 1)
        negative_space_ratio = float(np.sum(abs(grad_mag) < 15.0) / 10000.0)

        # Composite score
        final_score = thirds_score * 0.5 + (20.0 if has_leading_lines else 0.0) + (15.0 if has_good_headroom else -10.0) + (negative_space_ratio * 30.0)
        final_score = float(round(max(0.0, min(100.0, final_score)), 1))

        return {
            "composition_score": final_score,
            "has_leading_lines": has_leading_lines,
            "has_good_headroom": has_good_headroom,
            "negative_space_ratio": round(negative_space_ratio, 2)
        }
    except Exception as e:
        print(f"Error in analyze_composition: {e}")
        return {
            "composition_score": 50.0,
            "has_leading_lines": False,
            "has_good_headroom": True,
            "negative_space_ratio": 0.5
        }
