from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from datetime import datetime
from ..database import Base

class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    folder = Column(String, nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    exif_date = Column(String, nullable=True)
    is_raw = Column(Boolean, default=False)
    raw_format = Column(String, nullable=True)
    
    # Camera & EXIF details
    camera_make = Column(String, nullable=True)
    camera_model = Column(String, nullable=True)
    lens_model = Column(String, nullable=True)
    shutter_speed = Column(String, nullable=True)
    aperture = Column(String, nullable=True)
    iso = Column(Integer, nullable=True)
    focal_length = Column(String, nullable=True)
    
    # Scores
    blur_score = Column(Float, nullable=True)
    is_blurry = Column(Boolean, nullable=True)
    is_bokeh = Column(Boolean, default=False)
    exposure_score = Column(Float, nullable=True)
    exposure_type = Column(String, nullable=True)
    face_count = Column(Integer, nullable=True)
    has_closed_eyes = Column(Boolean, nullable=True)
    smile_score = Column(Float, nullable=True)
    group_consistency_score = Column(Float, nullable=True)
    detected_faces_json = Column(Text, nullable=True)  # JSON [{box: [x,y,w,h], has_closed_eyes: bool, is_smiling: bool, smile_score: float}]
    aesthetic_score = Column(Float, nullable=True)
    composition_score = Column(Float, nullable=True)
    overall_score = Column(Float, nullable=True, index=True)
    
    # Grouping & Story Arc
    duplicate_group_id = Column(String, nullable=True, index=True)
    burst_group_id = Column(String, nullable=True, index=True)
    is_burst_leader = Column(Boolean, default=False, index=True)
    scene_id = Column(String, nullable=True, index=True)
    scene_name = Column(String, nullable=True)
    
    # Genre & Advanced Artistic/Technical Attributes
    shoot_genre = Column(String, default="general", index=True)
    is_detail_shot = Column(Boolean, default=False, index=True)
    is_motion_intentional = Column(Boolean, default=False)
    lighting_type = Column(String, default="standard")
    is_vip_focused = Column(Boolean, default=False)
    reasons_json = Column(Text, nullable=True)  # {"positives": [...], "rejections": [...], "summary": "..."}
    camera_clock_offset = Column(Float, default=0.0)
    
    status = Column(String, default="pending", index=True) # pending, accepted, rejected
    is_tagged = Column(Boolean, default=False, index=True)
    is_analyzed = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    analyzed_at = Column(DateTime, nullable=True)

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    blur_threshold = Column(Float, default=30.0)
    exposure_low_threshold = Column(Float, default=35.0)
    exposure_high_threshold = Column(Float, default=65.0)
    duplicate_hash_distance = Column(Integer, default=10)
    burst_time_threshold = Column(Float, default=2.0)
    scene_gap_threshold = Column(Float, default=900.0) # 15 minutes
    min_overall_score = Column(Float, default=40.0)
    auto_accept_threshold = Column(Float, default=75.0)
    thumbnail_size = Column(Integer, default=300)
    gpu_enabled = Column(Boolean, default=True)
    github_repo = Column(String, default="firstpass/firstpass")
    
    # Feature Toggles
    enable_blink_detection = Column(Boolean, default=True)
    enable_smile_detection = Column(Boolean, default=True)
    enable_group_consistency = Column(Boolean, default=True)
    enable_bokeh_detection = Column(Boolean, default=True)
    enable_camera_shake = Column(Boolean, default=True)
    enable_burst_grouping = Column(Boolean, default=True)
    enable_scene_chapters = Column(Boolean, default=True)
    enable_preference_learning = Column(Boolean, default=True)
    enable_explainable_ai = Column(Boolean, default=True)
    enable_genre_awareness = Column(Boolean, default=True)

    # Genre & Delivery Quota
    active_shoot_genre = Column(String, default="wedding")
    target_delivery_count = Column(Integer, default=0)

    # Style learning offsets
    learned_blur_bias = Column(Float, default=0.0)
    learned_accept_bias = Column(Float, default=0.0)
    
    weight_blur = Column(Float, default=0.35)
    weight_exposure = Column(Float, default=0.25)
    weight_aesthetic = Column(Float, default=0.25)
    weight_composition = Column(Float, default=0.15)


class VipFace(Base):
    __tablename__ = "vip_faces"
    id = Column(Integer, primary_key=True, index=True)
    photo_id = Column(Integer, nullable=False, index=True)
    face_index = Column(Integer, nullable=False)
    label = Column(String, nullable=True)  # user-supplied name e.g. "Bride"
    thumbnail_b64 = Column(Text, nullable=True)  # base64 JPEG of the 128x128 face crop
    created_at = Column(DateTime, default=datetime.utcnow)
