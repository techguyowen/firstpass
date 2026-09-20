from PIL import Image
import imagehash
import uuid
from datetime import datetime
from typing import List, Dict, Tuple, Optional

def compute_hash(image_path: str) -> str:
    try:
        img = Image.open(image_path)
        phash = imagehash.phash(img)
        return str(phash)
    except Exception as e:
        print(f"Error computing hash for {image_path}: {e}")
        return ""

def find_duplicate_groups(photo_hashes: list[tuple[int, str]], threshold: int) -> dict[int, str]:
    groups = {} # photo_id -> group_id
    
    parsed_hashes = []
    for pid, h in photo_hashes:
        if h:
            try:
                parsed_hashes.append((pid, imagehash.hex_to_hash(h)))
            except:
                pass
                
    n = len(parsed_hashes)
    visited = set()
    
    for i in range(n):
        if i in visited:
            continue
            
        pid1, hash1 = parsed_hashes[i]
        current_group_id = None
        
        for j in range(i + 1, n):
            if j in visited:
                continue
                
            pid2, hash2 = parsed_hashes[j]
            dist = hash1 - hash2
            
            if dist <= threshold:
                if current_group_id is None:
                    current_group_id = str(uuid.uuid4())
                    groups[pid1] = current_group_id
                    
                groups[pid2] = current_group_id
                visited.add(j)
                
        visited.add(i)
        
    return groups

import re

def parse_date_safely(date_str: Optional[str], filename: Optional[str] = None) -> Optional[datetime]:
    if date_str:
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                return datetime.strptime(date_str.strip()[:19], fmt)
            except Exception:
                continue
    if filename:
        m = re.search(r'(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_](\d{2})[-_]?(\d{2})[-_]?(\d{2})', filename)
        if m:
            try:
                return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                                int(m.group(4)), int(m.group(5)), int(m.group(6)))
            except Exception:
                pass
    return None

def burst_pick_score(p: dict) -> float:
    """Calculates intelligent Pick of the Bunch leader score combining sharpness, expressions, and group consistency."""
    score = float(p.get("overall_score") or 0.0)
    # Severe penalty if closed eyes / blinks detected
    if p.get("has_closed_eyes"):
        score -= 40.0
    # Group consistency bonus (all eyes open + smiling)
    if p.get("group_consistency_score") is not None:
        score += float(p["group_consistency_score"]) * 0.25
    # Smile bonus
    if p.get("smile_score"):
        score += float(p["smile_score"]) * 0.15
    # Bokeh subject focus bonus
    if p.get("is_bokeh"):
        score += 10.0
    return score

def detect_burst_groups(
    photos: List[dict],
    time_threshold_seconds: float = 2.0
) -> Tuple[Dict[int, str], set[int]]:
    """
    Groups photos into burst sequences and selects the single 'Pick of the Bunch' leader.
    Returns:
      burst_map: {photo_id: burst_group_id}
      burst_leaders: set of photo_ids that are the 'Best Pick' in their burst group
    """
    burst_map = {}
    burst_leaders = set()
    
    # Group by folder first
    folders: Dict[str, List[dict]] = {}
    for p in photos:
        folder = p.get("folder", "")
        folders.setdefault(folder, []).append(p)
        
    for folder, folder_photos in folders.items():
        # Sort by timestamp (or filename if date is missing)
        def sort_key(item):
            dt = parse_date_safely(item.get("exif_date"), item.get("filename"))
            return (dt or datetime.min, item.get("filename", ""))
            
        sorted_photos = sorted(folder_photos, key=sort_key)
        
        current_burst = []
        
        for photo in sorted_photos:
            dt = parse_date_safely(photo.get("exif_date"), photo.get("filename"))
            if not current_burst:
                current_burst.append((photo, dt))
                continue
                
            last_photo, last_dt = current_burst[-1]
            is_burst = False
            
            if dt and last_dt:
                diff = abs((dt - last_dt).total_seconds())
                if diff <= time_threshold_seconds:
                    is_burst = True
            elif photo.get("duplicate_group_id") and photo.get("duplicate_group_id") == last_photo.get("duplicate_group_id"):
                is_burst = True
                
            if is_burst:
                current_burst.append((photo, dt))
            else:
                # Process completed burst
                if len(current_burst) >= 2:
                    gid = f"burst_{uuid.uuid4().hex[:8]}"
                    best_photo = max(current_burst, key=lambda x: burst_pick_score(x[0]))[0]
                    burst_leaders.add(best_photo["id"])
                    for bp, _ in current_burst:
                        burst_map[bp["id"]] = gid
                current_burst = [(photo, dt)]
                
        # Final burst in folder
        if len(current_burst) >= 2:
            gid = f"burst_{uuid.uuid4().hex[:8]}"
            best_photo = max(current_burst, key=lambda x: burst_pick_score(x[0]))[0]
            burst_leaders.add(best_photo["id"])
            for bp, _ in current_burst:
                burst_map[bp["id"]] = gid
                
    return burst_map, burst_leaders

def detect_scenes(
    photos: List[dict],
    gap_seconds: float = 900.0
) -> Dict[int, Tuple[str, str]]:
    """
    Segments a shoot into chronological chapters/scenes when shooting gaps exceed gap_seconds (default 15m).
    Returns: {photo_id: (scene_id, scene_name)}
    """
    scene_map = {}
    if not photos:
        return scene_map
        
    def sort_key(item):
        dt = parse_date_safely(item.get("exif_date"), item.get("filename"))
        return (dt or datetime.min, item.get("filename", ""))
        
    sorted_photos = sorted(photos, key=sort_key)
    
    scene_idx = 1
    current_scene_id = f"scene_{scene_idx}"
    current_scene_start_dt = None
    last_dt = None
    
    for p in sorted_photos:
        dt = parse_date_safely(p.get("exif_date"), p.get("filename"))
        
        if current_scene_start_dt is None and dt:
            current_scene_start_dt = dt
            
        if dt and last_dt:
            gap = (dt - last_dt).total_seconds()
            if gap >= gap_seconds:
                scene_idx += 1
                current_scene_id = f"scene_{scene_idx}"
                current_scene_start_dt = dt
                
        time_label = current_scene_start_dt.strftime("%I:%M %p").lstrip("0") if current_scene_start_dt else f"Part {scene_idx}"
        scene_name = f"Chapter {scene_idx} · {time_label}"
        scene_map[p["id"]] = (current_scene_id, scene_name)
        
        if dt:
            last_dt = dt
            
    return scene_map
