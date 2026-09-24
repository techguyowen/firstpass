import axios from 'axios'
import type {
  HealthResponse, ScanResponse, JobStatus, PhotosResponse, Photo,
  DuplicateGroup, ExportRequest, ExportResult, Settings,
  UpdateCheckResponse, UpdateProgressResponse, FaceCrop,
  FoldersResponse, FolderInfo, TargetQuotaRequest, TargetQuotaResult,
  CameraAlignmentResponse, SystemInfo
} from '../types/photo'

const BASE_URL = 'http://localhost:58765'

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

let cachedToken: string | null = (() => {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getApiSecretSync) {
      const tok = window.electronAPI.getApiSecretSync()
      if (tok) return tok
    }
    return localStorage.getItem('firstpass_api_token') || localStorage.getItem('photo_culler_api_token') || null
  } catch {
    return null
  }
})()

export async function initApiToken(): Promise<string> {
  if (!cachedToken && typeof window !== 'undefined' && window.electronAPI?.getApiSecret) {
    try {
      const tok = await window.electronAPI.getApiSecret()
      if (tok) {
        cachedToken = tok
        try {
          localStorage.setItem('firstpass_api_token', tok)
          localStorage.setItem('photo_culler_api_token', tok)
        } catch {
          // ignore storage failures
        }
        window.dispatchEvent(new CustomEvent('firstpass:token-ready', { detail: cachedToken }))
      }
    } catch (err) {
      console.warn('Failed to get API secret from Electron:', err)
    }
  }
  return cachedToken || ''
}

export function getApiToken(): string {
  return cachedToken || ''
}

void initApiToken()

axiosInstance.interceptors.request.use(async (config) => {
  if (!cachedToken) {
    await initApiToken()
  }
  if (cachedToken) {
    config.headers['X-FirstPass-Token'] = cachedToken
  }
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined' && window.electronAPI?.getApiSecret) {
      cachedToken = null
      await initApiToken()
    }
    return Promise.reject(error)
  }
)

export const api = {
  async getHealth(): Promise<HealthResponse> {
    const { data } = await axiosInstance.get('/api/health')
    return data
  },

  async scanFolder(folder_path: string): Promise<ScanResponse> {
    const { data } = await axiosInstance.post('/api/scan', { folder_path })
    return data
  },

  async startAnalysis(photo_ids?: number[]): Promise<{ job_id: string }> {
    const { data } = await axiosInstance.post('/api/analyze', photo_ids ? { photo_ids } : {})
    return data
  },

  async startReanalysis(photo_ids?: number[]): Promise<{ job_id: string }> {
    const { data } = await axiosInstance.post('/api/reanalyze', photo_ids ? { photo_ids } : {})
    return data
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const { data } = await axiosInstance.get(`/api/jobs/${jobId}`)
    return data
  },

  async getPhotos(params: Record<string, any> = {}): Promise<PhotosResponse> {
    const { data } = await axiosInstance.get('/api/photos', { params })
    return data
  },

  async getPhoto(id: number): Promise<Photo> {
    const { data } = await axiosInstance.get(`/api/photos/${id}`)
    return data
  },

  async updatePhotoStatus(id: number, status: Photo['status']): Promise<Photo> {
    const { data } = await axiosInstance.put(`/api/photos/${id}/status`, { status })
    return data
  },

  getThumbnailUrl(id: number): string {
    const base = `${BASE_URL}/api/photos/${id}/thumbnail`
    return cachedToken ? `${base}?token=${encodeURIComponent(cachedToken)}` : base
  },

  getFullImageUrl(id: number): string {
    const base = `${BASE_URL}/api/photos/${id}/full`
    return cachedToken ? `${base}?token=${encodeURIComponent(cachedToken)}` : base
  },

  async getPhotoFaces(id: number): Promise<{ faces: FaceCrop[]; total: number }> {
    const { data } = await axiosInstance.get(`/api/photos/${id}/faces`)
    return data
  },

  getFaceCropUrl(photoId: number, faceIndex: number, hash?: string): string {
    const base = `${BASE_URL}/api/photos/${photoId}/face/${faceIndex}`
    const params = new URLSearchParams()
    if (cachedToken) params.set('token', cachedToken)
    if (hash) params.set('h', hash)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  },

  async getDuplicateGroups(): Promise<DuplicateGroup[]> {
    const { data } = await axiosInstance.get('/api/duplicates')
    return data
  },

  async exportPhotos(req: ExportRequest, onProgress?: (job: JobStatus) => void): Promise<ExportResult> {
    // POST returns immediately with { job_id, total }; poll for completion
    // so large RAW batches never hit an HTTP timeout.
    const { data } = await axiosInstance.post('/api/export', req, { timeout: 300000 })

    // Backward compatibility: older backends return the ExportResult directly.
    if (!data || typeof data.job_id !== 'string') {
      return data as ExportResult
    }

    const jobId = data.job_id as string
    const deadline = Date.now() + 5 * 60 * 1000
    let job: JobStatus = { job_id: jobId, status: 'pending', progress: 0, total: data.total || 0, message: 'Queuing export...' }

    for (;;) {
      const { data: status } = await axiosInstance.get(`/api/jobs/${jobId}`)
      job = status as JobStatus
      onProgress?.(job)
      if (job.status === 'done' || job.status === 'error') break
      if (Date.now() > deadline) {
        throw new Error('Export timed out after 5 minutes')
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    if (job.status === 'error') {
      throw new Error(job.message || 'Export failed')
    }

    try {
      const { data: result } = await axiosInstance.get(`/api/export/result/${jobId}`)
      return result as ExportResult
    } catch {
      return {
        success: true,
        count: job.progress,
        processed: job.total,
        failed: Math.max(0, job.total - job.progress),
        message: job.message,
      }
    }
  },

  async getSystemInfo(): Promise<SystemInfo> {
    const { data } = await axiosInstance.get('/api/system/info')
    return data
  },

  async getSettings(): Promise<Settings> {
    const { data } = await axiosInstance.get('/api/settings')
    return data
  },

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    const { data } = await axiosInstance.put('/api/settings', settings)
    return data
  },

  async resetLibrary(): Promise<void> {
    await axiosInstance.delete('/api/reset')
  },

  async resetLearning(): Promise<void> {
    await axiosInstance.post('/api/settings/reset-learning')
  },

  async getStats(): Promise<{ total: number; analyzed: number; accepted: number; rejected: number; pending: number; blurry: number; duplicates: number }> {
    const { data } = await axiosInstance.get('/api/stats')
    return data
  },

  async getFolders(): Promise<FoldersResponse> {
    const { data } = await axiosInstance.get('/api/folders')
    return data
  },

  async removeFolder(folder: string): Promise<{ success: boolean; deleted: number; folder: string }> {
    const { data } = await axiosInstance.delete('/api/folders', { params: { folder } })
    return data
  },

  // ── GitHub In-App Updater ──────────────────────────────────────────────
  async checkForUpdates(): Promise<UpdateCheckResponse> {
    const { data } = await axiosInstance.get('/api/updater/check')
    return data
  },

  async downloadUpdate(download_url: string, asset_name?: string): Promise<{ message: string }> {
    const { data } = await axiosInstance.post('/api/updater/download', { download_url, asset_name })
    return data
  },

  async getUpdateProgress(): Promise<UpdateProgressResponse> {
    const { data } = await axiosInstance.get('/api/updater/progress')
    return data
  },

  async installUpdate(): Promise<{ success: boolean; message: string }> {
    const { data } = await axiosInstance.post('/api/updater/install')
    return data
  },

  // ── Delivery Constraints & Multi-Camera Alignment ────────────────────────
  async applyTargetQuota(req: TargetQuotaRequest): Promise<TargetQuotaResult> {
    const { data } = await axiosInstance.post('/api/cull/target-quota', req)
    return data
  },

  async alignCameras(folder?: string): Promise<CameraAlignmentResponse> {
    const { data } = await axiosInstance.post('/api/cull/align-cameras', null, {
      params: folder ? { folder } : {}
    })
    return data
  },

  async reanalyzePhoto(id: number): Promise<any> {
    const { data } = await axiosInstance.post(`/api/photos/${id}/reanalyze`)
    return data
  },

  async autoPickDuplicates(): Promise<{ success: boolean; groups_processed: number; accepted: number; rejected: number }> {
    const { data } = await axiosInstance.post('/api/duplicates/auto-pick')
    return data
  },

  async getVipFaces(): Promise<{ vip_faces: any[] }> {
    const { data } = await axiosInstance.get('/api/vip-faces')
    return data
  },

  async addVipFace(photo_id: number, face_index: number, label?: string): Promise<any> {
    const { data } = await axiosInstance.post('/api/vip-faces', { photo_id, face_index, label: label || 'VIP' })
    return data
  },

  async removeVipFace(vip_id: number): Promise<void> {
    await axiosInstance.delete(`/api/vip-faces/${vip_id}`)
  },

  async removeVipFaceByPhoto(photo_id: number, face_index: number): Promise<void> {
    await axiosInstance.delete(`/api/vip-faces/by-photo/${photo_id}/${face_index}`)
  },

  async toggleTag(photoId: number, is_tagged?: boolean): Promise<Photo> {
    const { data } = await axiosInstance.put(`/api/photos/${photoId}/tag`, is_tagged !== undefined ? { is_tagged } : {})
    return data
  },
}

// Also export under legacy name for backward compatibility
export const apiClient = api
export { axiosInstance }
export default api
