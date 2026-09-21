import { create } from 'zustand'
import type { Photo, Settings, JobStatus, FolderInfo } from '../types/photo'
import { api } from '../api/client'
import toast from 'react-hot-toast'

export interface FilterState {
  search?: string
  status: string             // '' | 'pending' | 'accepted' | 'rejected'
  min_score?: number
  is_blurry?: boolean
  is_bokeh?: boolean
  exposure_type?: string     // 'underexposed' | 'overexposed'
  has_faces?: boolean
  min_face_count?: number
  max_face_count?: number
  has_closed_eyes?: boolean
  is_smiling?: boolean
  duplicate_only?: boolean
  burst_only?: boolean
  is_burst_leader?: boolean
  is_detail_shot?: boolean
  is_motion_intentional?: boolean
  shoot_genre?: string
  scene_id?: string
  folder?: string
  is_raw?: boolean
  is_tagged?: boolean
  sort_by: string
}

export interface ViewOptions {
  columns: number         // 3 | 4 | 5 | 6
  showFilename: boolean   // default true
  showExif: boolean       // default false
  showScoreBadge: boolean // default true
  showAiChips: boolean    // default true
  showChapters: boolean   // default true
  collapseBursts: boolean // default true
}

const defaultViewOptions: ViewOptions = {
  columns: 4,
  showFilename: true,
  showExif: false,
  showScoreBadge: true,
  showAiChips: true,
  showChapters: true,
  collapseBursts: true,
}

export interface UndoRecord {
  photoId: number
  previousStatus: Photo['status']
  newStatus: Photo['status']
  filename: string
}

function getStoredViewOptions(): ViewOptions {
  try {
    const saved = localStorage.getItem('firstpass_view_options') || localStorage.getItem('photo_culler_view_options')
    if (saved) {
      return { ...defaultViewOptions, ...JSON.parse(saved) }
    }
  } catch {}
  return defaultViewOptions
}

interface PhotosStore {
  photos: Photo[]
  totalPhotos: number
  libraryTotal: number
  fitMode: 'contain' | 'cover'
  viewOptions: ViewOptions
  currentPhoto: Photo | null
  filters: FilterState
  folders: FolderInfo[]
  isScanning: boolean
  isAnalyzing: boolean
  scanJobId: string | null
  analyzeJobId: string | null
  scanProgress: number
  analyzeProgress: number
  gpuAvailable: boolean
  gpuType: string
  settings: Settings | null
  backendReady: boolean
  undoStack: UndoRecord[]
  redoStack: UndoRecord[]
  lastReviewedPhotoId: number | null
  activePhotoId: number | null
  autoAdvance: boolean
  filmstripPosition: 'bottom' | 'side' | 'hidden'

  // Actions
  setActivePhotoId: (id: number | null) => void
  setLastReviewedPhotoId: (id: number | null) => void
  toggleAutoAdvance: () => void
  setFilmstripPosition: (pos: 'bottom' | 'side' | 'hidden') => void
  togglePhotoTag: (photoId: number) => Promise<void>
  setPhotos: (photos: Photo[]) => void
  setFitMode: (mode: 'contain' | 'cover') => void
  setViewOptions: (options: Partial<ViewOptions>) => void
  setCurrentPhoto: (photo: Photo | null) => void
  updatePhotoStatusLocal: (id: number, status: Photo['status']) => void
  setPhotoStatusWithUndo: (photoId: number, status: Photo['status']) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  setFilters: (filters: Partial<FilterState>) => void
  startScan: (folderPath: string, clearPrevious?: boolean) => Promise<void>
  startAnalysis: (photoIds?: number[]) => Promise<void>
  startReanalysis: (photoIds?: number[]) => Promise<void>
  pollJob: (jobId: string, type: 'scan' | 'analyze') => void
  loadSettings: () => Promise<void>
  checkHealth: () => Promise<void>
  loadPhotos: () => Promise<void>
  loadFolders: () => Promise<void>
  removeFolder: (folderPath: string) => Promise<void>
  resetLibrary: () => Promise<void>
  fetchPhotos: () => Promise<void>  // alias
}

export const usePhotosStore = create<PhotosStore>((set, get) => ({
  photos: [],
  totalPhotos: 0,
  libraryTotal: 0,
  fitMode: 'contain',
  viewOptions: getStoredViewOptions(),
  currentPhoto: null,
  filters: {
    status: '',
    sort_by: 'overall_score_desc',
  },
  folders: [],
  isScanning: false,
  isAnalyzing: false,
  scanJobId: null,
  analyzeJobId: null,
  scanProgress: 0,
  analyzeProgress: 0,
  gpuAvailable: false,
  gpuType: 'cpu',
  settings: null,
  backendReady: false,
  undoStack: [],
  redoStack: [],
  lastReviewedPhotoId: (() => { try { const v = localStorage.getItem('firstpass_last_photo') || localStorage.getItem('photo_culler_last_photo'); return v ? parseInt(v) : null } catch { return null } })(),
  activePhotoId: (() => { try { const v = localStorage.getItem('firstpass_active_photo_id') || localStorage.getItem('firstpass_last_photo') || localStorage.getItem('photo_culler_active_photo_id') || localStorage.getItem('photo_culler_last_photo'); return v ? parseInt(v) : null } catch { return null } })(),
  autoAdvance: (() => { try { const v = localStorage.getItem('firstpass_auto_advance') ?? localStorage.getItem('photo_culler_auto_advance'); return v !== 'false' } catch { return true } })(),
  filmstripPosition: (() => { try { return (localStorage.getItem('firstpass_filmstrip') || localStorage.getItem('photo_culler_filmstrip') as any) || 'bottom' } catch { return 'bottom' } })(),

  setActivePhotoId: (id) => {
    set({ activePhotoId: id, lastReviewedPhotoId: id })
    try {
      if (id !== null) {
        localStorage.setItem('firstpass_active_photo_id', String(id))
        localStorage.setItem('firstpass_last_photo', String(id))
        localStorage.setItem('photo_culler_active_photo_id', String(id))
        localStorage.setItem('photo_culler_last_photo', String(id))
      } else {
        localStorage.removeItem('firstpass_active_photo_id')
        localStorage.removeItem('photo_culler_active_photo_id')
      }
    } catch {}
  },

  toggleAutoAdvance: () => {
    const next = !get().autoAdvance
    set({ autoAdvance: next })
    try {
      localStorage.setItem('firstpass_auto_advance', String(next))
      localStorage.setItem('photo_culler_auto_advance', String(next))
    } catch {}
    toast(next ? '⚡ Auto-Advance Enabled' : '⏸ Auto-Advance Paused', { icon: next ? '⚡' : '⏸', duration: 1500 })
  },

  setFilmstripPosition: (pos) => {
    set({ filmstripPosition: pos })
    try {
      localStorage.setItem('firstpass_filmstrip', pos)
      localStorage.setItem('photo_culler_filmstrip', pos)
    } catch {}
  },

  togglePhotoTag: async (photoId: number) => {
    const currentPhotos = get().photos
    const target = currentPhotos.find(p => p.id === photoId)
    const newTagged = target ? !target.is_tagged : true

    set({
      photos: currentPhotos.map(p => p.id === photoId ? { ...p, is_tagged: newTagged } : p),
      currentPhoto: get().currentPhoto?.id === photoId ? { ...get().currentPhoto!, is_tagged: newTagged } : get().currentPhoto
    })

    try {
      await api.toggleTag(photoId, newTagged)
      toast(newTagged ? '🏷️ Tagged' : '🏷️ Untagged', { duration: 1000 })
    } catch {
      set({
        photos: currentPhotos,
        currentPhoto: get().currentPhoto?.id === photoId ? target || null : get().currentPhoto
      })
      toast.error('Failed to update tag')
    }
  },

  setLastReviewedPhotoId: (id) => {
    set({ lastReviewedPhotoId: id })
    try {
      if (id) {
        localStorage.setItem('firstpass_last_photo', String(id))
        localStorage.setItem('photo_culler_last_photo', String(id))
      } else {
        localStorage.removeItem('firstpass_last_photo')
        localStorage.removeItem('photo_culler_last_photo')
      }
    } catch {}
  },
  setPhotos: (photos) => set({ photos }),
  setFitMode: (fitMode) => set({ fitMode }),
  setViewOptions: (opts) => set((state) => {
    const next = { ...state.viewOptions, ...opts }
    try {
      localStorage.setItem('firstpass_view_options', JSON.stringify(next))
      localStorage.setItem('photo_culler_view_options', JSON.stringify(next))
    } catch {}
    return { viewOptions: next }
  }),
  setCurrentPhoto: (photo) => set({ currentPhoto: photo }),

  updatePhotoStatusLocal: (id, status) => set(state => ({
    photos: state.photos.map(p => p.id === id ? { ...p, status } : p),
    currentPhoto: state.currentPhoto?.id === id ? { ...state.currentPhoto, status } : state.currentPhoto,
  })),

  setPhotoStatusWithUndo: async (photoId, newStatus) => {
    const state = get()
    const photo = state.photos.find(p => p.id === photoId) || (state.currentPhoto?.id === photoId ? state.currentPhoto : null)
    if (!photo) return
    if (photo.status === newStatus) return

    const prevStatus = photo.status
    const record: UndoRecord = {
      photoId,
      previousStatus: prevStatus,
      newStatus,
      filename: photo.filename,
    }

    set({
      photos: state.photos.map(p => p.id === photoId ? { ...p, status: newStatus } : p),
      currentPhoto: state.currentPhoto?.id === photoId ? { ...state.currentPhoto, status: newStatus } : state.currentPhoto,
      undoStack: [...state.undoStack, record],
      redoStack: [],
    })

    try {
      await api.updatePhotoStatus(photoId, newStatus)
    } catch (e: any) {
      toast.error('Failed to update status')
      set(s => ({
        photos: s.photos.map(p => p.id === photoId ? { ...p, status: prevStatus } : p),
        currentPhoto: s.currentPhoto?.id === photoId ? { ...s.currentPhoto, status: prevStatus } : s.currentPhoto,
        undoStack: s.undoStack.slice(0, -1),
      }))
    }
  },

  undo: async () => {
    const state = get()
    if (state.undoStack.length === 0) {
      toast('Nothing to undo', { icon: 'ℹ️' })
      return
    }
    const record = state.undoStack[state.undoStack.length - 1]
    const nextUndo = state.undoStack.slice(0, -1)
    const nextRedo = [...state.redoStack, record]

    set({
      photos: state.photos.map(p => p.id === record.photoId ? { ...p, status: record.previousStatus } : p),
      currentPhoto: state.currentPhoto?.id === record.photoId ? { ...state.currentPhoto, status: record.previousStatus } : state.currentPhoto,
      undoStack: nextUndo,
      redoStack: nextRedo,
    })

    try {
      await api.updatePhotoStatus(record.photoId, record.previousStatus)
      const label = record.previousStatus === 'accepted' ? 'Accepted' : record.previousStatus === 'rejected' ? 'Rejected' : 'Pending'
      toast.success(`↩ Undone: ${record.filename} reverted to ${label}`)
    } catch (e: any) {
      toast.error('Failed to revert status')
    }
  },

  redo: async () => {
    const state = get()
    if (state.redoStack.length === 0) {
      toast('Nothing to redo', { icon: 'ℹ️' })
      return
    }
    const record = state.redoStack[state.redoStack.length - 1]
    const nextRedo = state.redoStack.slice(0, -1)
    const nextUndo = [...state.undoStack, record]

    set({
      photos: state.photos.map(p => p.id === record.photoId ? { ...p, status: record.newStatus } : p),
      currentPhoto: state.currentPhoto?.id === record.photoId ? { ...state.currentPhoto, status: record.newStatus } : state.currentPhoto,
      undoStack: nextUndo,
      redoStack: nextRedo,
    })

    try {
      await api.updatePhotoStatus(record.photoId, record.newStatus)
      const label = record.newStatus === 'accepted' ? 'Accepted' : record.newStatus === 'rejected' ? 'Rejected' : 'Pending'
      toast.success(`↪ Redone: ${record.filename} set to ${label}`)
    } catch (e: any) {
      toast.error('Failed to re-apply status')
    }
  },

  setFilters: (newFilters) => {
    set(state => ({ filters: { ...state.filters, ...newFilters } }))
    get().loadPhotos()
  },

  loadPhotos: async () => {
    try {
      const { filters } = get()
      const params: Record<string, any> = {
        per_page: 5000,
        sort_by: filters.sort_by || 'overall_score_desc',
      }
      if (filters.search) params.search = filters.search
      if (filters.status) params.status = filters.status
      if (filters.min_score !== undefined) params.min_score = filters.min_score
      if (filters.is_blurry !== undefined) params.is_blurry = filters.is_blurry
      if (filters.is_bokeh !== undefined) params.is_bokeh = filters.is_bokeh
      if (filters.exposure_type) params.exposure_type = filters.exposure_type
      if (filters.has_faces !== undefined) params.has_faces = filters.has_faces
      if (filters.has_closed_eyes !== undefined) params.has_closed_eyes = filters.has_closed_eyes
      if (filters.is_smiling !== undefined) params.is_smiling = filters.is_smiling
      if (filters.duplicate_only) params.duplicate_only = true
      if (filters.burst_only) params.burst_only = true
      if (filters.is_burst_leader !== undefined) params.is_burst_leader = filters.is_burst_leader
      if (filters.scene_id) params.scene_id = filters.scene_id
      if (filters.folder) params.folder = filters.folder
      if (filters.is_raw !== undefined) params.is_raw = filters.is_raw
      if (filters.min_face_count !== undefined) params.min_face_count = filters.min_face_count
      if (filters.max_face_count !== undefined) params.max_face_count = filters.max_face_count
      if (filters.is_tagged !== undefined) params.is_tagged = filters.is_tagged

      const res = await api.getPhotos(params)
      set({ photos: res.photos || [], totalPhotos: res.total || 0 })

      const isFiltered = Boolean(
        filters.search || filters.status || filters.folder ||
        filters.is_tagged !== undefined ||
        filters.is_blurry !== undefined || filters.is_bokeh !== undefined ||
        filters.exposure_type || filters.has_faces !== undefined ||
        filters.min_face_count !== undefined || filters.max_face_count !== undefined ||
        filters.has_closed_eyes !== undefined || filters.is_smiling !== undefined ||
        filters.duplicate_only || filters.burst_only || filters.is_burst_leader !== undefined ||
        filters.scene_id || filters.is_raw !== undefined || filters.min_score !== undefined
      )
      if (!isFiltered) {
        set({ libraryTotal: res.total || 0 })
      } else {
        api.getStats().then(s => set({ libraryTotal: s.total || 0 })).catch(() => {})
      }
    } catch (e) {
      console.error('Failed to fetch photos', e)
    }
  },

  loadFolders: async () => {
    try {
      const res = await api.getFolders()
      set({ folders: res.folders || [] })
    } catch (e) {
      console.error('Failed to load folders', e)
    }
  },

  removeFolder: async (folderPath: string) => {
    try {
      await api.removeFolder(folderPath)
      const currentFilter = get().filters.folder
      if (currentFilter === folderPath) {
        get().setFilters({ folder: undefined })
      } else {
        await get().loadPhotos()
      }
      await get().loadFolders()
      toast.success('Removed folder from library')
    } catch (e: any) {
      toast.error('Failed to remove folder: ' + (e.message || ''))
    }
  },

  resetLibrary: async () => {
    try {
      await api.resetLibrary()
      set({ photos: [], totalPhotos: 0, folders: [] })
      get().setFilters({ folder: undefined })
      toast.success('Session cleared')
    } catch (e: any) {
      toast.error('Failed to clear session')
    }
  },

  fetchPhotos: async () => get().loadPhotos(),

  startScan: async (folderPath, clearPrevious = false) => {
    if (clearPrevious) {
      try {
        await api.resetLibrary()
        set({ photos: [], totalPhotos: 0, folders: [] })
        get().setFilters({ folder: undefined })
      } catch (e) {
        console.error('Failed to clear session before scan', e)
      }
    }
    set({ isScanning: true, scanProgress: 0 })
    try {
      const res = await api.scanFolder(folderPath)
      set({ scanJobId: res.job_id })
      get().pollJob(res.job_id, 'scan')
    } catch (e: any) {
      toast.error('Failed to start scan: ' + (e.message || ''))
      set({ isScanning: false })
    }
  },

  startAnalysis: async (photoIds?: number[]) => {
    set({ isAnalyzing: true, analyzeProgress: 0 })
    try {
      const res = await api.startAnalysis(photoIds)
      if (res.job_id) {
        set({ analyzeJobId: res.job_id })
        get().pollJob(res.job_id, 'analyze')
      }
    } catch (e: any) {
      toast.error('Failed to start analysis: ' + (e.message || ''))
      set({ isAnalyzing: false })
    }
  },

  startReanalysis: async (photoIds?: number[]) => {
    set({ isAnalyzing: true, analyzeProgress: 0 })
    try {
      const res = await api.startReanalysis(photoIds)
      if (res.job_id) {
        set({ analyzeJobId: res.job_id })
        get().pollJob(res.job_id, 'analyze')
      }
    } catch (e: any) {
      toast.error('Failed to start re-analysis: ' + (e.message || ''))
      set({ isAnalyzing: false })
    }
  },

  pollJob: (jobId, type) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId)
        const pct = status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0

        if (type === 'scan') {
          set({ scanProgress: pct, totalPhotos: status.total })
        } else {
          set({ analyzeProgress: pct })
        }

        if (status.status === 'done' || status.status === 'error') {
          clearInterval(interval)
          if (type === 'scan') {
            set({ isScanning: false, scanJobId: null })
            // After scan (which also analyzes), reload photos
            await get().loadPhotos()
            toast.success(`Import complete — ${status.total} photos analyzed!`)
          } else {
            set({ isAnalyzing: false, analyzeJobId: null })
            await get().loadPhotos()
            if (status.status === 'done') toast.success('Analysis complete!')
            else toast.error('Analysis error: ' + status.message)
          }
        }
      } catch (e) {
        clearInterval(interval)
        if (type === 'scan') set({ isScanning: false, scanJobId: null })
        else set({ isAnalyzing: false, analyzeJobId: null })
      }
    }, 800)
  },

  loadSettings: async () => {
    try {
      const settings = await api.getSettings()
      set({ settings })
    } catch (e) {
      console.error('Failed to load settings', e)
    }
  },

  checkHealth: async () => {
    try {
      const health = await api.getHealth()
      set({ backendReady: true, gpuAvailable: health.gpu_available, gpuType: health.gpu_type || 'cpu' })
    } catch {
      set({ backendReady: false })
    }
  },
}))
