from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class PhotoBase(BaseModel):
    path: str
    filename: str
    folder: str
    file_size: int
    width: int
    height: int
    exif_date: Optional[str] = None
    is_raw: bool = False
    raw_format: Optional[str] = None
    
    # Camera & EXIF details
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    lens_model: Optional[str] = None
    shutter_speed: Optional[str] = None
    aperture: Optional[str] = None
    iso: Optional[int] = None
    focal_length: Optional[str] = None

class PhotoCreate(PhotoBase):
    pass

class PhotoResponse(PhotoBase):
    id: int
    blur_score: Optional[float] = None
    is_blurry: Optional[bool] = None
    is_bokeh: Optional[bool] = False
    exposure_score: Optional[float] = None
    exposure_type: Optional[str] = None
    face_count: Optional[int] = None
    has_closed_eyes: Optional[bool] = None
    smile_score: Optional[float] = None
    group_consistency_score: Optional[float] = None
    detected_faces_json: Optional[str] = None
    aesthetic_score: Optional[float] = None
    composition_score: Optional[float] = None
    overall_score: Optional[float] = None
    
    duplicate_group_id: Optional[str] = None
    burst_group_id: Optional[str] = None
    is_burst_leader: bool = False
    scene_id: Optional[str] = None
    scene_name: Optional[str] = None

    # Genre & Advanced Attributes
    shoot_genre: Optional[str] = "general"
    is_detail_shot: Optional[bool] = False
    is_motion_intentional: Optional[bool] = False
    lighting_type: Optional[str] = "standard"
    is_vip_focused: Optional[bool] = False
    reasons_json: Optional[str] = None
    camera_clock_offset: Optional[float] = 0.0
    
    status: str
    is_analyzed: bool
    created_at: datetime
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SettingsBase(BaseModel):
    blur_threshold: float = 30.0
    exposure_low_threshold: float = 35.0
    exposure_high_threshold: float = 65.0
    duplicate_hash_distance: int = 10
    burst_time_threshold: float = 2.0
    scene_gap_threshold: float = 900.0
    min_overall_score: float = 40.0
    auto_accept_threshold: float = 75.0
    thumbnail_size: int = 300
    gpu_enabled: bool = True
    github_repo: str = "techguyowen/firstpass"
    
    enable_blink_detection: bool = True
    enable_smile_detection: bool = True
    enable_group_consistency: bool = True
    enable_bokeh_detection: bool = True
    enable_camera_shake: bool = True
    enable_burst_grouping: bool = True
    enable_scene_chapters: bool = True
    enable_preference_learning: bool = True
    enable_explainable_ai: bool = True
    enable_genre_awareness: bool = True

    active_shoot_genre: str = "wedding"
    target_delivery_count: int = 0

    learned_blur_bias: float = 0.0
    learned_accept_bias: float = 0.0
    
    weight_blur: float = 0.35
    weight_exposure: float = 0.25
    weight_aesthetic: float = 0.25
    weight_composition: float = 0.15

class SettingsResponse(SettingsBase):
    class Config:
        from_attributes = True

class SettingsUpdate(SettingsBase):
    pass

class ScanRequest(BaseModel):
    folder_path: str

class ExportRequest(BaseModel):
    photo_ids: List[int]
    action: str # 'move'|'copy'|'trash'|'mark_only'
    destination_folder: Optional[str] = None

class JobStatus(BaseModel):
    job_id: str
    status: str # 'pending'|'running'|'done'|'error'
    progress: int
    total: int
    message: str

class AnalyzeRequest(BaseModel):
    photo_ids: Optional[List[int]] = None

class TargetQuotaRequest(BaseModel):
    target_count: int
    folder: Optional[str] = None
    preserve_story_arc: bool = True

class CameraAlignmentResponse(BaseModel):
    success: bool
    cameras_detected: List[str]
    offsets_applied: dict
    message: str

