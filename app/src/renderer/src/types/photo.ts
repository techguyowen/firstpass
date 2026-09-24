export interface Photo {
  id: number;
  path: string;
  filename: string;
  folder: string;
  file_size: number;
  width: number;
  height: number;
  exif_date: string | null;
  is_raw: boolean;
  raw_format: string | null;
  
  // Camera shooting parameters
  camera_make?: string | null;
  camera_model?: string | null;
  lens_model?: string | null;
  shutter_speed?: string | null;
  aperture?: string | null;
  iso?: number | null;
  focal_length?: string | null;
  
  // Scores
  blur_score: number | null;
  is_blurry: boolean | null;
  is_bokeh?: boolean;
  exposure_score: number | null;
  exposure_type: 'good' | 'underexposed' | 'overexposed' | null;
  face_count: number | null;
  has_closed_eyes: boolean | null;
  smile_score?: number | null;
  group_consistency_score?: number | null;
  detected_faces_json?: string | null;
  aesthetic_score: number | null;
  composition_score: number | null;
  overall_score: number | null;
  
  // Grouping & Scene Chaptering
  duplicate_group_id: string | null;
  burst_group_id?: string | null;
  is_burst_leader?: boolean;
  scene_id?: string | null;
  scene_name?: string | null;

  // Genre, Artistic Safeguards & Explainable AI
  shoot_genre?: string;
  is_detail_shot?: boolean;
  is_motion_intentional?: boolean;
  lighting_type?: string;
  is_vip_focused?: boolean;
  reasons_json?: string | null;
  camera_clock_offset?: number;
  
  status: 'pending' | 'accepted' | 'rejected';
  is_tagged?: boolean;
  is_analyzed: boolean;
  created_at: string;
  analyzed_at: string | null;
}

export interface FaceCrop {
  index: number;
  box: [number, number, number, number];
  has_closed_eyes: boolean;
  is_smiling?: boolean;
  smile_score?: number;
  sharpness?: number;
  is_vip?: boolean;
  vip_id?: number | null;
  url: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  total: number;
  message: string;
}

export interface Settings {
  blur_threshold: number;
  exposure_low_threshold: number;
  exposure_high_threshold: number;
  duplicate_hash_distance: number;
  burst_time_threshold?: number;
  scene_gap_threshold?: number;
  min_overall_score: number;
  auto_accept_threshold: number;
  thumbnail_size: number;
  gpu_enabled: boolean;
  github_repo?: string;
  enable_blink_detection?: boolean;
  enable_smile_detection?: boolean;
  enable_group_consistency?: boolean;
  enable_bokeh_detection?: boolean;
  enable_camera_shake?: boolean;
  enable_burst_grouping?: boolean;
  enable_scene_chapters?: boolean;
  enable_preference_learning?: boolean;
  learned_blur_bias?: number;
  learned_accept_bias?: number;
  weight_blur: number;
  weight_exposure: number;
  weight_aesthetic: number;
  weight_composition: number;
  active_shoot_genre?: string;
  enable_explainable_ai?: boolean;
  enable_genre_awareness?: boolean;
  target_delivery_count?: number;
}

export interface DuplicateGroup {
  group_id: string;
  photos: Photo[];
}

export interface ExportRequest {
  photo_ids: number[];
  action: 'move' | 'copy' | 'trash' | 'mark_only' | 'xmp';
  destination_folder?: string;
}

export interface ExportResult {
  success: boolean;
  count?: number;
  processed: number;
  failed: number;
  message?: string;
}

export interface SystemInfo {
  app_version: string;
  platform: string;
  os_system: string;
  os_release: string;
  machine: string;
  python_version: string;
  gpu_available: boolean;
  gpu_type: string;
  gpu_name: string;
  log_path: string;
  data_dir: string;
  database_path: string;
  database_size_bytes: number;
  database_size_mb: number;
  total_photos: number;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
  gpu_type: string;
  gpu_name?: string;
}

export interface ScanResponse {
  job_id: string;
  total: number;
}

export interface PhotosResponse {
  photos: Photo[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface PhotoQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  min_score?: number;
  is_blurry?: boolean;
  is_bokeh?: boolean;
  exposure_type?: string;
  has_faces?: boolean;
  has_closed_eyes?: boolean;
  is_smiling?: boolean;
  scene_id?: string;
  folder?: string;
  is_raw?: boolean;
  duplicate_only?: boolean;
  burst_only?: boolean;
  is_burst_leader?: boolean;
  is_detail_shot?: boolean;
  is_motion_intentional?: boolean;
  shoot_genre?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface FolderInfo {
  path: string;
  name: string;
  count: number;
}

export interface FoldersResponse {
  folders: FolderInfo[];
  total_folders: number;
}

export interface UpdateCheckResponse {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_name?: string;
  release_notes?: string;
  download_url?: string;
  asset_name?: string;
  asset_size?: number;
  published_at?: string;
  message?: string;
}

export interface UpdateProgressResponse {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
  file_path?: string;
  error_message?: string;
}

export interface ExplainableReasons {
  summary: string;
  positives: string[];
  rejections: string[];
}

export interface TargetQuotaRequest {
  target_count: number;
  folder?: string;
  preserve_story_arc?: boolean;
}

export interface SceneQuotaDetail {
  scene_name: string;
  total: number;
  quota: number;
  accepted: number;
}

export interface TargetQuotaResult {
  success: boolean;
  target_requested: number;
  accepted_count: number;
  rejected_count: number;
  scene_breakdown: Record<string, SceneQuotaDetail>;
  message: string;
}

export interface CameraAlignmentResponse {
  success: boolean;
  cameras_detected: string[];
  offsets_applied: Record<string, number>;
  message: string;
}
