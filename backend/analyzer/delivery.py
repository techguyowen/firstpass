"""
Delivery & Multi-Camera Synchronization
1. Target Count / "Magic Number" Quota Delivery: Dynamically calculates scene quotas so delivery preserves the story arc.
2. Multi-Camera & Second-Shooter Alignment: Analyzes shoot timelines to calculate clock drift and interleave bodies.
"""

from datetime import datetime
from collections import defaultdict
import math

def calculate_target_quota(photos: list, target_count: int, preserve_story_arc: bool = True) -> dict:
    """
    Given a list of photo dicts/objects with 'id', 'overall_score', and optional 'scene_id',
    selects exactly target_count top photos distributed proportionally across all scene chapters.
    """
    total = len(photos)
    if total == 0:
        return {"accepted_ids": [], "rejected_ids": [], "scene_breakdown": {}}

    target_count = max(1, min(total, target_count))

    if not preserve_story_arc:
        # Simple global cutoff
        sorted_photos = sorted(photos, key=lambda p: getattr(p, 'overall_score', 0.0) or 0.0, reverse=True)
        accepted_ids = [getattr(p, 'id') for p in sorted_photos[:target_count]]
        rejected_ids = [getattr(p, 'id') for p in sorted_photos[target_count:]]
        return {
            "accepted_ids": accepted_ids,
            "rejected_ids": rejected_ids,
            "scene_breakdown": {"All Photos": len(accepted_ids)}
        }

    # Group photos by scene
    scene_groups = defaultdict(list)
    for p in photos:
        s_id = getattr(p, 'scene_name', None) or getattr(p, 'scene_id', None) or "General"
        scene_groups[s_id].append(p)

    scene_breakdown = {}
    accepted_ids = []
    rejected_ids = []

    # Calculate proportional quota per scene
    remaining_quota = target_count
    scene_quotas = {}
    for scene_name, s_photos in scene_groups.items():
        ratio = len(s_photos) / total
        quota = max(1, int(round(ratio * target_count)))
        quota = min(len(s_photos), quota)
        scene_quotas[scene_name] = quota

    # Normalize quotas if rounding caused mismatch with target_count
    current_sum = sum(scene_quotas.values())
    diff = target_count - current_sum

    if diff != 0:
        # Adjust in largest scenes
        sorted_scenes = sorted(scene_groups.keys(), key=lambda s: len(scene_groups[s]), reverse=True)
        for s in sorted_scenes:
            if diff == 0:
                break
            if diff > 0 and scene_quotas[s] < len(scene_groups[s]):
                scene_quotas[s] += 1
                diff -= 1
            elif diff < 0 and scene_quotas[s] > 1:
                scene_quotas[s] -= 1
                diff += 1

    # Select top photos per scene
    for scene_name, s_photos in scene_groups.items():
        quota = scene_quotas.get(scene_name, 1)
        sorted_s = sorted(s_photos, key=lambda p: getattr(p, 'overall_score', 0.0) or 0.0, reverse=True)
        
        acc = [getattr(p, 'id') for p in sorted_s[:quota]]
        rej = [getattr(p, 'id') for p in sorted_s[quota:]]
        
        accepted_ids.extend(acc)
        rejected_ids.extend(rej)
        scene_breakdown[scene_name] = len(acc)

    return {
        "accepted_ids": accepted_ids,
        "rejected_ids": rejected_ids,
        "scene_breakdown": scene_breakdown
    }


def calculate_camera_alignment(photos: list) -> dict:
    """
    Detects clock drift across multiple camera bodies and returns offsets in seconds.
    """
    cameras = defaultdict(list)
    for p in photos:
        cam = getattr(p, 'camera_model', None)
        dt_str = getattr(p, 'exif_date', None)
        if cam and dt_str:
            try:
                # Format: "YYYY:MM:DD HH:MM:SS"
                dt = datetime.strptime(dt_str[:19], "%Y:%m:%d %H:%M:%S")
                cameras[cam].append((getattr(p, 'id'), dt))
            except Exception:
                pass

    cam_names = list(cameras.keys())
    if len(cam_names) < 2:
        return {
            "success": True,
            "cameras_detected": cam_names,
            "offsets_applied": {c: 0.0 for c in cam_names},
            "message": "Single camera body detected. Timeline is naturally aligned."
        }

    # Reference camera is the one with the most photos
    primary_cam = max(cam_names, key=lambda c: len(cameras[c]))
    offsets = {primary_cam: 0.0}

    # For secondary cameras, compute timeline span median offset
    primary_start = min(dt for _, dt in cameras[primary_cam])
    
    for cam in cam_names:
        if cam == primary_cam:
            continue
        sec_start = min(dt for _, dt in cameras[cam])
        # If secondary camera clock started noticeably earlier or later
        drift = (primary_start - sec_start).total_seconds()
        # Bound drift within a reasonable shoot window (under 12 hours)
        if abs(drift) < 43200:
            offsets[cam] = round(drift, 1)
        else:
            offsets[cam] = 0.0

    return {
        "success": True,
        "cameras_detected": cam_names,
        "offsets_applied": offsets,
        "message": f"Aligned {len(cam_names)} camera bodies to primary ({primary_cam})."
    }
