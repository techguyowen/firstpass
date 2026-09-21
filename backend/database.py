import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

_firstpass_dir = os.path.expanduser("~/.firstpass")
_legacy_dir = os.path.expanduser("~/.photo-culler")
_default_dir = _firstpass_dir if os.path.exists(_firstpass_dir) else (_legacy_dir if os.path.exists(_legacy_dir) else _firstpass_dir)
DATA_DIR = os.getenv("FIRSTPASS_DATA_DIR", os.getenv("PHOTO_CULLER_DATA_DIR", _default_dir))
os.makedirs(DATA_DIR, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'photos.db')}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    # Use WAL mode for better concurrency
    isolation_level="AUTOCOMMIT"
)
# Note: AUTOCOMMIT combined with the event listener below enables WAL mode efficiently in SQLite
from sqlalchemy import event
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def auto_migrate(db_engine):
    """Automatically add any missing columns to existing SQLite tables."""
    with db_engine.connect() as conn:
        # Migrate settings table
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(settings)").fetchall()
            existing_cols = {row[1] for row in res}
            if "burst_time_threshold" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN burst_time_threshold FLOAT DEFAULT 2.0")
            if "github_repo" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN github_repo VARCHAR DEFAULT 'techguyowen/firstpass'")
            if "scene_gap_threshold" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN scene_gap_threshold FLOAT DEFAULT 900.0")
            if "learned_blur_bias" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN learned_blur_bias FLOAT DEFAULT 0.0")
            if "learned_accept_bias" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN learned_accept_bias FLOAT DEFAULT 0.0")
            
            # Feature toggles
            toggle_cols = [
                "enable_blink_detection",
                "enable_smile_detection",
                "enable_group_consistency",
                "enable_bokeh_detection",
                "enable_camera_shake",
                "enable_burst_grouping",
                "enable_scene_chapters",
                "enable_preference_learning",
                "enable_explainable_ai",
                "enable_genre_awareness"
            ]
            for col in toggle_cols:
                if col not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE settings ADD COLUMN {col} BOOLEAN DEFAULT 1")
            if "active_shoot_genre" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN active_shoot_genre VARCHAR DEFAULT 'wedding'")
            if "target_delivery_count" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN target_delivery_count INTEGER DEFAULT 0")
        except Exception:
            pass

        # Migrate photos table
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(photos)").fetchall()
            existing_cols = {row[1] for row in res}
            if existing_cols:
                cols_to_add = [
                    ("detected_faces_json", "TEXT"),
                    ("camera_make", "VARCHAR"),
                    ("camera_model", "VARCHAR"),
                    ("lens_model", "VARCHAR"),
                    ("shutter_speed", "VARCHAR"),
                    ("aperture", "VARCHAR"),
                    ("iso", "INTEGER"),
                    ("focal_length", "VARCHAR"),
                    ("burst_group_id", "VARCHAR"),
                    ("is_burst_leader", "BOOLEAN DEFAULT 0"),
                    ("is_bokeh", "BOOLEAN DEFAULT 0"),
                    ("smile_score", "FLOAT"),
                    ("group_consistency_score", "FLOAT"),
                    ("scene_id", "VARCHAR"),
                    ("scene_name", "VARCHAR"),
                    ("shoot_genre", "VARCHAR DEFAULT 'general'"),
                    ("is_detail_shot", "BOOLEAN DEFAULT 0"),
                    ("is_motion_intentional", "BOOLEAN DEFAULT 0"),
                    ("lighting_type", "VARCHAR DEFAULT 'standard'"),
                    ("is_vip_focused", "BOOLEAN DEFAULT 0"),
                    ("is_tagged", "BOOLEAN DEFAULT 0"),
                    ("reasons_json", "TEXT"),
                    ("camera_clock_offset", "FLOAT DEFAULT 0.0"),
                ]
                for col_name, col_type in cols_to_add:
                    if col_name not in existing_cols:
                        conn.exec_driver_sql(f"ALTER TABLE photos ADD COLUMN {col_name} {col_type}")
                conn.exec_driver_sql("UPDATE photos SET is_vip_focused = 0 WHERE is_analyzed = 0 OR face_count = 0 OR face_count IS NULL")
                
                # Performance Indexes for massive shoots (5,000+ photos)
                conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_photos_folder ON photos(folder)")
                conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_photos_burst_group_id ON photos(burst_group_id)")
                conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_photos_is_burst_leader ON photos(is_burst_leader)")
                conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_photos_scene_id ON photos(scene_id)")
                conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_photos_overall_score ON photos(overall_score)")
        except Exception:
            pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

