import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, X, ZoomIn, ZoomOut, Crown, Camera, Sparkles,
  Lock, Unlock, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2,
  Users, Eye, Layers, RotateCcw, RotateCw, ArrowLeftRight, Pin, FolderUp,
  Link2, Unlink
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../api/client'
import { setNavigationDirection, getRamCachedImageUrl, triggerPredictiveLookahead } from '../utils/imagePreloader'
import {
  normalizeFaceCenter,
  rotateFaceCenter,
  type FaceBox,
} from '../utils/faceZoom'
import { usePhotosStore } from '../store/photosStore'
import { matchesShortcut, subscribeShortcuts } from '../utils/shortcutsManager'
import type { Photo } from '../types/photo'
import clsx from 'clsx'
import FirstPassLoader from '../components/FirstPassLoader'

export const Compare: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { photos: storePhotos, updatePhotoStatusLocal, setActivePhotoId, fetchPhotos, togglePhotoTag } = usePhotosStore()

  const returnTo = searchParams.get('returnTo') || '/'
  const handleBack = useCallback(() => navigate(returnTo), [navigate, returnTo])

  const [comparePhotos, setComparePhotos] = useState<Photo[]>([])
  const [lockReference, setLockReference] = useState<boolean>(true)
  const [activeSlot, setActiveSlot] = useState<number>(1) // 0 for left (ref), 1 for right (candidate)

  // Independent per-slot view state: zoom, pan offset, and rotation.
  // Slot 0 is the Reference, slots 1..3 are Candidates (2/3/4-up layouts).
  interface SlotView {
    zoom: number
    pan: { x: number; y: number }
    rotation: 0 | 90 | 180 | 270
  }
  const DEFAULT_SLOT_VIEW: SlotView = { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 }
  const makeDefaultSlotViews = (): SlotView[] => [
    { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } },
    { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } },
    { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } },
    { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } },
  ]
  const [slotViews, setSlotViews] = useState<SlotView[]>(makeDefaultSlotViews)

  // Multi-up layout: 2, 3, or 4 mirrored comparison viewports.
  type LayoutMode = '2-up' | '3-up' | '4-up'
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const saved = localStorage.getItem('firstpass_compare_layout')
      if (saved === '3-up' || saved === '4-up' || saved === '2-up') return saved
    } catch {}
    return '2-up'
  })
  const slotCount = layoutMode === '2-up' ? 2 : layoutMode === '3-up' ? 3 : 4
  const setLayoutModeAndStore = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode)
    // Keep the focused viewport inside the visible grid.
    setActiveSlot((prev) => Math.min(prev, mode === '2-up' ? 1 : mode === '3-up' ? 2 : 3))
    try {
      localStorage.setItem('firstpass_compare_layout', mode)
    } catch {}
  }, [])

  // 4-up orientation: 2x2 quad grid vs 1x4 horizontal landscape row.
  type FourUpOrientation = 'grid' | 'landscape'
  const [fourUpOrientation, setFourUpOrientation] = useState<FourUpOrientation>(() => {
    try {
      const saved = localStorage.getItem('firstpass_compare_4up_orientation')
      if (saved === 'grid' || saved === 'landscape') return saved
    } catch {}
    return 'landscape'
  })
  const setFourUpOrientationAndStore = useCallback((ori: FourUpOrientation) => {
    setFourUpOrientation(ori)
    try {
      localStorage.setItem('firstpass_compare_4up_orientation', ori)
    } catch {}
  }, [])

  const handleSelectLayoutMode = useCallback((mode: LayoutMode) => {
    if (mode === '4-up' && layoutMode === '4-up') {
      const next = fourUpOrientation === 'grid' ? 'landscape' : 'grid'
      setFourUpOrientationAndStore(next)
      toast(`4-Up Layout: ${next === 'landscape' ? '1×4 Landscape Row' : '2×2 Quad Grid'}`, {
        id: '4up-ori',
        icon: next === 'landscape' ? '▥' : '⊞'
      })
      return
    }
    setLayoutModeAndStore(mode)
  }, [layoutMode, fourUpOrientation, setLayoutModeAndStore, setFourUpOrientationAndStore])

  // Mirrored viewports: pan/zoom in any slot mirrors across all active slots.
  const [syncViewports, setSyncViewports] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('firstpass_compare_sync')
      if (saved === 'false') return false
    } catch {}
    return true
  })
  const syncViewportsRef = useRef(syncViewports)
  syncViewportsRef.current = syncViewports
  const toggleSyncViewports = useCallback(() => {
    // Toast outside the updater: toasting inside setState runs during render
    // and warns about updating the Toaster mid-render.
    const next = !syncViewportsRef.current
    setSyncViewports(next)
    try {
      localStorage.setItem('firstpass_compare_sync', String(next))
    } catch {}
    toast(next ? 'Sync Viewports: ON — zoom, pan & rotation mirrored' : 'Sync Viewports: OFF — slots move independently', { id: 'sync-viewports', icon: next ? '🔗' : '⛓️‍💥' })
  }, [])
  // Face-Anchored Registration ("Face Lock"): when ON and zoomed past 1x,
  // each viewport pins its pan so the photo's primary face stays centered.
  const [faceLock, setFaceLock] = useState<boolean>(() => {
    try {
      return localStorage.getItem('firstpass_compare_facelock') === 'true'
    } catch { return false }
  })
  const faceLockRef = useRef(faceLock)
  faceLockRef.current = faceLock
  const toggleFaceLock = useCallback(() => {
    // Toast outside the updater: toasting inside setState runs during render
    // and warns about updating the Toaster mid-render.
    const next = !faceLockRef.current
    setFaceLock(next)
    try { localStorage.setItem('firstpass_compare_facelock', String(next)) } catch {}
    toast(next ? 'Face Lock: ON — viewports auto-center on subject faces' : 'Face Lock: OFF — manual coordinate lockstep', { id: 'facelock-toast', icon: '🎯' })
  }, [])

  // "Lock Zoom Between Photos" (shared with Review via localStorage + View menu)
  const [lockZoom, setLockZoom] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('firstpass:lock_zoom')
        ?? localStorage.getItem('firstpass_lock_zoom')
        ?? localStorage.getItem('photo_culler_lock_zoom')
      return saved === 'true'
    } catch {
      return false
    }
  })
  const lockZoomRef = useRef(lockZoom)
  lockZoomRef.current = lockZoom
  // "Lock Turn Between Photos" (shared with Review via localStorage + View menu)
  const [lockTurn, setLockTurn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('firstpass:lock_turn')
        ?? localStorage.getItem('firstpass_lock_turn')
        ?? localStorage.getItem('photo_culler_lock_turn')
      return saved === 'true'
    } catch {
      return false
    }
  })
  const lockTurnRef = useRef(lockTurn)
  lockTurnRef.current = lockTurn
  const slotViewsRef = useRef(slotViews)
  slotViewsRef.current = slotViews
  const comparePhotosRef = useRef(comparePhotos)
  comparePhotosRef.current = comparePhotos
  const slotContainerRefs = useRef<(HTMLDivElement | null)[]>([])
  // Option/Alt + wheel rotation guards: accumulate delta and cooldown so a
  // single trackpad scroll gesture steps rotation once instead of spinning.
  const wheelRotateAccumulator = useRef<Record<number, number>>({})
  const lastWheelRotateTime = useRef<Record<number, number>>({})
  const [dragSlot, setDragSlot] = useState<number | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [showFilmstrip, setShowFilmstrip] = useState<boolean>(true)
  const [showMatchMenu, setShowMatchMenu] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const viewForSlot = (slot: number): SlotView => slotViews[slot] || DEFAULT_SLOT_VIEW

  const patchSlotView = useCallback((slot: number, patch: Partial<SlotView>) => {
    setSlotViews((prev) => {
      // Ensure 4 slots exist so 3-up/4-up layouts always have view state.
      const full: SlotView[] = [0, 1, 2, 3].map((i) => prev[i] || { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } })
      const base = full[slot] || DEFAULT_SLOT_VIEW
      const merged: SlotView = {
        ...base,
        ...patch,
        pan: patch.pan ? { ...patch.pan } : { ...base.pan },
      }
      // Mirrored viewports: zoom/pan/rotation edits in ANY slot apply to ALL slots.
      if (syncViewportsRef.current && (patch.zoom !== undefined || patch.pan !== undefined || patch.rotation !== undefined)) {
        return full.map((v) => ({
          ...v,
          zoom: patch.zoom !== undefined ? merged.zoom : v.zoom,
          pan: patch.pan !== undefined ? { ...merged.pan } : v.pan,
          rotation: patch.rotation !== undefined ? merged.rotation : v.rotation,
        }))
      }
      const next = [...full]
      next[slot] = merged
      return next
    })
  }, [])

  // Adobe-style Match commands: copy the Reference (slot 0) view onto every Candidate slot
  const handleMatchZoom = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0]) return prev
      return prev.map((v, i) => (i === 0 ? v : { ...v, zoom: prev[0].zoom }))
    })
    toast.success('Matched Zoom across photographs', { id: 'match-view' })
  }, [])

  const handleMatchLocation = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0]) return prev
      return prev.map((v, i) => (i === 0 ? v : { ...v, pan: { ...prev[0].pan } }))
    })
    toast.success('Matched Location across photographs', { id: 'match-view' })
  }, [])

  const handleMatchRotation = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0]) return prev
      return prev.map((v, i) => (i === 0 ? v : { ...v, rotation: prev[0].rotation }))
    })
    toast.success('Matched Rotation across photographs', { id: 'match-view' })
  }, [])

  const handleMatchAll = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0]) return prev
      return prev.map((v, i) => (i === 0 ? v : { ...v, zoom: prev[0].zoom, pan: { ...prev[0].pan }, rotation: prev[0].rotation }))
    })
    toast.success('Matched Zoom & Location across photographs', { id: 'match-view' })
  }, [])

  const stepSlotRotation = useCallback((slot: number, dir: 1 | -1) => {
    const order: SlotView['rotation'][] = [0, 90, 180, 270]
    const current = slotViewsRef.current[slot] || DEFAULT_SLOT_VIEW
    const next = order[(order.indexOf(current.rotation) + dir + order.length) % order.length]
    patchSlotView(slot, { rotation: next })
  }, [patchSlotView])

  const handleRotateSlot = useCallback((slot: number) => {
    stepSlotRotation(slot, 1)
  }, [stepSlotRotation])

  const toggleLockZoom = useCallback(() => {
    const next = !lockZoomRef.current
    setLockZoom(next)
    try {
      localStorage.setItem('firstpass:lock_zoom', String(next))
      localStorage.setItem('firstpass_lock_zoom', String(next))
    } catch {}
    window.electronAPI?.updateMenuState?.({ lockZoom: next, lockTurn: lockTurnRef.current })
    toast(next ? 'Lock Zoom Across Photos: ON' : 'Lock Zoom Across Photos: OFF', { id: 'lock-zoom-toast', icon: '🔒' })
  }, [])

  const toggleLockTurn = useCallback(() => {
    const next = !lockTurnRef.current
    setLockTurn(next)
    try {
      localStorage.setItem('firstpass:lock_turn', String(next))
      localStorage.setItem('firstpass_lock_turn', String(next))
    } catch {}
    window.electronAPI?.updateMenuState?.({ lockTurn: next, lockZoom: lockZoomRef.current })
    toast(next ? 'Lock Turn Across Photos: ON' : 'Lock Turn Across Photos: OFF', { id: 'lock-turn-toast', icon: '🔒' })
  }, [])

  // Keep the native menu checkbox in sync with this page's lock state
  useEffect(() => {
    window.electronAPI?.updateMenuState?.({ lockZoom, lockTurn })
  }, [lockZoom, lockTurn])

  // Per-slot pinch-to-zoom / pan / rotate via scroll & trackpad gestures
  useEffect(() => {
    const cleanups: (() => void)[] = []
    slotContainerRefs.current.forEach((el, slot) => {
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        const view = slotViewsRef.current[slot] || DEFAULT_SLOT_VIEW
        // Trackpad pinch-to-zoom arrives as wheel + Ctrl/Cmd (Chromium/macOS)
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          const next = Math.max(1, Math.min(5, view.zoom + -e.deltaY * 0.01))
          patchSlotView(slot, next <= 1 ? { zoom: 1, pan: { x: 0, y: 0 } } : { zoom: next })
          return
        }
        // Alt/Option + wheel steps rotation (debounced: accumulate delta,
        // require a threshold, and enforce a cooldown between steps so
        // trackpad/mouse scroll can't trigger runaway rapid spinning).
        // Shift+wheel is intentionally NOT rotation (horizontal scroll/modifier).
        if (e.altKey) {
          e.preventDefault()
          const now = Date.now()
          const lastTime = lastWheelRotateTime.current[slot] || 0
          if (now - lastTime < 250) return

          wheelRotateAccumulator.current[slot] = (wheelRotateAccumulator.current[slot] || 0) + e.deltaY
          const THRESHOLD = 50
          if (Math.abs(wheelRotateAccumulator.current[slot]) >= THRESHOLD) {
            const dir = wheelRotateAccumulator.current[slot] > 0 ? 1 : -1
            wheelRotateAccumulator.current[slot] = 0
            lastWheelRotateTime.current[slot] = now
            stepSlotRotation(slot, dir)
          }
          return
        }
        // Plain two-finger scroll pans while zoomed in
        if (view.zoom > 1) {
          e.preventDefault()
          patchSlotView(slot, { pan: { x: view.pan.x - e.deltaX, y: view.pan.y - e.deltaY } })
        }
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      cleanups.push(() => el.removeEventListener('wheel', onWheel))
    })
    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [patchSlotView, stepSlotRotation, comparePhotos.length])

  const filmstripRef = useRef<HTMLDivElement>(null)

  // Ensure store photos are loaded if directly opening Compare
  useEffect(() => {
    if (storePhotos.length === 0) {
      fetchPhotos().catch(() => {})
    }
  }, [storePhotos.length, fetchPhotos])

  // Initialize comparison photos — once per navigation target. Follow-up store
  // updates (ratings, King-of-the-Hill refills) must not clobber the live slots.
  const compareInitKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const idsParam = searchParams.get('ids')
    const initKey = idsParam ? `ids:${idsParam}` : (storePhotos.length === 0 ? 'default-empty' : 'default')
    if (compareInitKeyRef.current === initKey) return
    compareInitKeyRef.current = initKey
    if (!idsParam && storePhotos.length === 0) {
      setLoading(false)
      return
    }
    if (idsParam) {
      const ids = idsParam.split(',').map(Number).filter(Boolean)
      Promise.all(ids.map((id) => api.getPhoto(id).catch(() => null)))
        .then((results) => {
          const valid = results.filter((p): p is Photo => Boolean(p && p.id))
          if (valid.length === 1 && storePhotos.length > 1) {
            // Find an adjacent candidate from store
            const idx = storePhotos.findIndex((p) => p.id === valid[0].id)
            const nextPhoto = idx !== -1
              ? storePhotos[(idx + 1) % storePhotos.length]
              : storePhotos.find(p => p.id !== valid[0].id)
            if (nextPhoto) {
              setComparePhotos([valid[0], nextPhoto])
            } else {
              setComparePhotos([valid[0]])
            }
            setActivePhotoId(valid[0].id)
          } else {
            setComparePhotos(valid)
            if (valid[0]) setActivePhotoId(valid[0].id)
          }
        })
        .catch(() => {
          toast.error('Could not load comparison photos')
        })
        .finally(() => setLoading(false))
    } else {
      // Default to activePhotoId and neighbor, or first 2 photos
      const activeId = usePhotosStore.getState().activePhotoId || usePhotosStore.getState().lastReviewedPhotoId
      if (activeId && storePhotos.length > 1) {
        const idx = storePhotos.findIndex((p) => p.id === activeId)
        if (idx !== -1) {
          const neighborIdx = idx > 0 ? idx - 1 : 1
          const neighborPhoto = storePhotos[neighborIdx]
          const activePhoto = storePhotos[idx]
          if (neighborPhoto && activePhoto) {
            setComparePhotos([neighborPhoto, activePhoto])
            setLoading(false)
            return
          }
        }
      }
      const validStore = storePhotos.filter((p): p is Photo => Boolean(p && p.id))
      if (validStore.length >= 2) {
        setComparePhotos([validStore[0], validStore[1]])
      } else if (validStore.length === 1) {
        setComparePhotos([validStore[0]])
      }
      setLoading(false)
    }
  }, [searchParams, storePhotos, setActivePhotoId])

  // Update status
  const handleSetStatus = useCallback(async (id: number, status: 'accepted' | 'rejected' | 'pending') => {
    try {
      await api.updatePhotoStatus(id, status)
      updatePhotoStatusLocal(id, status)
      setComparePhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      )
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }, [updatePhotoStatusLocal])

  // Next chronological un-evaluated frame not already slotted (fallback: any unslotted frame).
  const getNextQueuedPhoto = useCallback((currentIds: number[]): Photo | undefined => {
    const all = usePhotosStore.getState().photos.filter((p): p is Photo => Boolean(p && p.id))
    return all.find((p) => !currentIds.includes(p.id) && p.status === 'pending')
      ?? all.find((p) => !currentIds.includes(p.id))
  }, [])

  const scrollFilmstripTo = useCallback((id: number | undefined) => {
    if (id == null) return
    requestAnimationFrame(() => {
      document.getElementById(`filmstrip-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    })
  }, [])

  // Reset zoom/pan/rotation for a freshly loaded photo, honoring the lock toggles.
  const resetSlotViewForNewPhoto = useCallback((slot: number) => {
    const resetPatch: Partial<SlotView> = {}
    if (!lockZoomRef.current) {
      resetPatch.zoom = 1
      resetPatch.pan = { x: 0, y: 0 }
    }
    if (!lockTurnRef.current && !lockZoomRef.current) {
      resetPatch.rotation = 0
    }
    if (Object.keys(resetPatch).length > 0) {
      patchSlotView(slot, resetPatch)
    }
  }, [patchSlotView])

  // "King of the Hill" promotion (2-Up): the Candidate (Slot 1) dethrones the
  // Reference (Slot 0) and the next queued frame loads as the new challenger.
  const handleKingOfTheHillPromote = useCallback(() => {
    const prev = comparePhotosRef.current
    if (prev.length < 2 || !prev[0] || !prev[1]) return
    const newRef = prev[1]
    const currentIds = prev.map((p) => p.id)
    const nextCandidate = getNextQueuedPhoto(currentIds)
    setComparePhotos(nextCandidate ? [newRef, nextCandidate] : [newRef])
    if (nextCandidate) setActivePhotoId(nextCandidate.id)
    resetSlotViewForNewPhoto(1)
    scrollFilmstripTo(nextCandidate ? nextCandidate.id : newRef.id)
    toast.success(`Promoted ${newRef.filename} to Reference (#1)`, { id: 'koth-promote' })
  }, [getNextQueuedPhoto, setActivePhotoId, resetSlotViewForNewPhoto, scrollFilmstripTo])

  // Rate the active photo, then auto-replace ONLY the vacated pane:
  // 2-Up rejects on the Candidate keep the Reference static and pull the next
  // challenger; 3-Up/4-Up rejects refill just the rejected slot. Other slots
  // (and non-reject statuses) are left untouched.
  const handleSetStatusAndAdvance = useCallback(async (slotIdx: number, status: 'accepted' | 'rejected' | 'pending') => {
    const targetPhoto = comparePhotosRef.current[slotIdx]
    if (!targetPhoto) return
    await handleSetStatus(targetPhoto.id, status)
    if (status !== 'rejected') return
    const current = comparePhotosRef.current
    const currentIds = current.map((p) => p.id)
    const nextPhoto = getNextQueuedPhoto(currentIds)
    if (!nextPhoto) return
    if (layoutMode === '2-up') {
      // King of the Hill: only the Candidate pane turns over; Slot 0 stays put.
      if (slotIdx !== 1 || !current[0]) return
      setComparePhotos([current[0], nextPhoto])
    } else {
      if (slotIdx >= slotCount) return
      setComparePhotos((prev) => {
        const next = [...prev]
        if (slotIdx < next.length) next[slotIdx] = nextPhoto
        return next
      })
    }
    setActivePhotoId(nextPhoto.id)
    resetSlotViewForNewPhoto(slotIdx)
    scrollFilmstripTo(nextPhoto.id)
  }, [handleSetStatus, layoutMode, slotCount, getNextQueuedPhoto, setActivePhotoId, resetSlotViewForNewPhoto, scrollFilmstripTo])

  // Primary face center as image fractions (0..1), from absolute-pixel [x,y,w,h] boxes.
  // Boxes are normalized against the detection coordinate space (per-face
  // det_width/det_height when the backend provides them), so downscaled
  // detection arrays cannot shift the anchor.
  const getPrimaryFaceCenter = (photo: Photo): { cx: number; cy: number } | null => {
    try {
      if (!photo.detected_faces_json) return null
      const raw: unknown = JSON.parse(photo.detected_faces_json)
      if (!Array.isArray(raw)) return null
      const iw = photo.width || 0
      const ih = photo.height || 0
      if (iw <= 0 || ih <= 0) return null
      let best: { cx: number; cy: number } | null = null
      let bestArea = 0
      for (const f of raw) {
        const rec = (f ?? {}) as {
          box?: unknown
          det_width?: number | null
          det_height?: number | null
        }
        const b = rec.box
        let x = NaN, y = NaN, w = NaN, h = NaN
        if (Array.isArray(b) && b.length === 4) {
          [x, y, w, h] = b as [number, number, number, number]
        } else if (b && typeof b === 'object') {
          const o = b as { x?: number; y?: number; w?: number; h?: number; width?: number; height?: number }
          x = o.x ?? NaN; y = o.y ?? NaN; w = o.w ?? o.width ?? NaN; h = o.h ?? o.height ?? NaN
        } else {
          continue
        }
        if (![x, y, w, h].every((v) => Number.isFinite(v)) || w <= 0 || h <= 0) continue
        const area = (w as number) * (h as number)
        if (area > bestArea) {
          bestArea = area
          const c = normalizeFaceCenter(
            [x as number, y as number, w as number, h as number] as FaceBox,
            iw,
            ih,
            { detWidth: rec.det_width, detHeight: rec.det_height }
          )
          best = { cx: c.nx, cy: c.ny }
        }
      }
      return best
    } catch {
      return null
    }
  }

  // Pin one slot's pan so its primary face lands on the viewport center.
  // Writes the slot directly (bypassing Sync mirroring) — each photo has its own face.
  const centerSlotOnFace = useCallback((slot: number) => {
    const photo = comparePhotosRef.current[slot]
    const view = slotViewsRef.current[slot]
    if (!photo || !view || view.zoom <= 1) return
    const face = getPrimaryFaceCenter(photo)
    if (!face) return
    const el = slotContainerRefs.current[slot]
    if (!el) return
    const cw = el.clientWidth || 1
    const ch = el.clientHeight || 1
    const iw = photo.width || 1
    const ih = photo.height || 1
    // object-contain fit: displayed image size inside the slot container.
    // The layout box keeps the unrotated aspect (CSS rotation paints on top),
    // so fit with photo dims, then map the face center into the slot's
    // rotated frame and pan with the painted (axis-swapped for 90/270°) size.
    let dw = cw
    let dh = cw * (ih / iw)
    if (dh > ch) {
      dh = ch
      dw = ch * (iw / ih)
    }
    const rot = view.rotation ?? 0
    const mapped = rotateFaceCenter(face.cx, face.cy, rot)
    const paintedW = rot === 90 || rot === 270 ? dh : dw
    const paintedH = rot === 90 || rot === 270 ? dw : dh
    const pan = { x: -(mapped.nx - 0.5) * paintedW * view.zoom, y: -(mapped.ny - 0.5) * paintedH * view.zoom }
    setSlotViews((prev) => {
      const full: SlotView[] = [0, 1, 2, 3].map((i) => prev[i] || { ...DEFAULT_SLOT_VIEW, pan: { ...DEFAULT_SLOT_VIEW.pan } })
      const cur = full[slot] || DEFAULT_SLOT_VIEW
      if (Math.hypot(cur.pan.x - pan.x, cur.pan.y - pan.y) < 0.5) return prev
      const next = [...full]
      next[slot] = { ...cur, pan }
      return next
    })
  }, [])

  // Set a specific photo as reference (Slot 0), preserving other slots
  const handleSetReference = useCallback((photo: Photo) => {
    setComparePhotos((prev) => {
      if (prev.length === 0) return [photo]
      const withoutPhoto = prev.filter((p) => p?.id !== photo.id)
      const oldRef = withoutPhoto[0]
      const rest = withoutPhoto.slice(1)
      // If the photo was already slotted, swap it with the old reference.
      // Otherwise insert it as reference and shift the old slots down (capped at 4).
      const wasSlotted = prev.some((p) => p?.id === photo.id)
      if (wasSlotted && oldRef) return [photo, oldRef, ...rest]
      return [photo, ...withoutPhoto].slice(0, 4)
    })
    toast.success(`Set ${photo.filename} as Reference (#1)`, { id: 'ref-photo' })
  }, [])

  // Swap Slot 0 (Ref) and Slot 1 (Candidate) — in 2-Up this is the
  // "King of the Hill" promotion: the Candidate becomes the reigning
  // Reference and the next queued frame loads as the new challenger.
  const handleSwap = useCallback(() => {
    if (layoutMode === '2-up') {
      handleKingOfTheHillPromote()
      return
    }
    setComparePhotos((prev) => {
      if (prev.length < 2) return prev
      return [prev[1], prev[0]]
    })
    toast.success('Swapped Reference & Candidate', { id: 'ref-photo' })
  }, [layoutMode, handleKingOfTheHillPromote])

  // Fill comparePhotos up to the active layout's slot count from neighboring
  // store photos so 3-up/4-up never render empty viewports.
  useEffect(() => {
    setComparePhotos((prev) => {
      if (prev.length >= slotCount || storePhotos.length === 0) return prev
      const next = [...prev]
      for (const p of storePhotos) {
        if (next.length >= slotCount) break
        if (!next.some((q) => q.id === p.id)) next.push(p)
      }
      return next.length === prev.length ? prev : next
    })
  }, [slotCount, storePhotos])

  // Face Lock registration: when ON, re-pin each zoomed viewport onto its
  // photo's primary face whenever the zoom level or slotted photo changes.
  // Manual drag-pans are left alone (pan-only changes never re-trigger).
  const faceLockPrevRef = useRef<Record<number, { zoom: number; photoId: number | undefined }>>({})
  const faceLockWasOnRef = useRef(false)
  useEffect(() => {
    if (!faceLock) {
      faceLockWasOnRef.current = false
      faceLockPrevRef.current = {}
      return
    }
    if (!faceLockWasOnRef.current) {
      faceLockPrevRef.current = {}
      faceLockWasOnRef.current = true
    }
    const prev = faceLockPrevRef.current
    const views = slotViewsRef.current
    const photos = comparePhotosRef.current
    const snapshot: Record<number, { zoom: number; photoId: number | undefined }> = {}
    for (let slot = 0; slot < slotCount; slot++) {
      const view = views[slot]
      const photo = photos[slot]
      const photoId = photo?.id
      snapshot[slot] = { zoom: view?.zoom ?? 1, photoId }
      const was = prev[slot]
      if (view && view.zoom > 1 && photo && (!was || was.zoom !== view.zoom || was.photoId !== photoId)) {
        centerSlotOnFace(slot)
      }
    }
    faceLockPrevRef.current = snapshot
  }, [faceLock, comparePhotos, slotViews, slotCount, centerSlotOnFace])

  // Candidate navigation
  const navigateCandidate = useCallback((direction: 'next' | 'prev') => {
    if (storePhotos.length === 0 || comparePhotos.length === 0) return

    // Arrow keys advance the active slot photo (never the locked Reference).
    const targetSlot = lockReference && activeSlot === 0 ? 1 : activeSlot
    const currentPhoto = comparePhotos[targetSlot] || comparePhotos[0]
    const currentIdx = storePhotos.findIndex((p) => p.id === currentPhoto.id)

    let nextIdx = 0
    if (direction === 'next') {
      nextIdx = (currentIdx + 1) % storePhotos.length
      // If next is same as reference and lock is on, skip it
      if (lockReference && comparePhotos[0] && storePhotos[nextIdx].id === comparePhotos[0].id) {
        nextIdx = (nextIdx + 1) % storePhotos.length
      }
    } else {
      nextIdx = (currentIdx - 1 + storePhotos.length) % storePhotos.length
      if (lockReference && comparePhotos[0] && storePhotos[nextIdx].id === comparePhotos[0].id) {
        nextIdx = (nextIdx - 1 + storePhotos.length) % storePhotos.length
      }
    }

    const newPhoto = storePhotos[nextIdx]
    // Candidate lookahead: pivot direction and prime upcoming candidate frames
    setNavigationDirection(direction === 'next' ? 1 : -1)
    triggerPredictiveLookahead(storePhotos, nextIdx, api.getFullImageUrl, api.getThumbnailUrl)
    setActivePhotoId(newPhoto.id)
    setComparePhotos((prev) => {
      const nextList = [...prev]
      if (targetSlot < nextList.length) {
        nextList[targetSlot] = newPhoto
      } else {
        nextList.push(newPhoto)
      }
      return nextList
    })

    // View persistence: preserve zoom/pan if lockZoom is active, rotation if lockTurn is active
    const resetPatch: Partial<SlotView> = {}
    if (!lockZoomRef.current) {
      resetPatch.zoom = 1
      resetPatch.pan = { x: 0, y: 0 }
    }
    if (!lockTurnRef.current && !lockZoomRef.current) {
      resetPatch.rotation = 0
    }
    if (Object.keys(resetPatch).length > 0) {
      patchSlotView(targetSlot, resetPatch)
    }

    // Scroll filmstrip thumbnail into view
    const thumbEl = document.getElementById(`filmstrip-${newPhoto.id}`)
    if (thumbEl) {
      thumbEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [storePhotos, comparePhotos, lockReference, activeSlot, patchSlotView])

  // Re-render live key bindings when shortcuts change.
  const [, setShortcutsVersion] = useState(0)
  useEffect(() => subscribeShortcuts(() => setShortcutsVersion(v => v + 1)), [])

  // Keyboard navigation & Shortcuts (rebindable via shortcutsManager)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return

      // Modifier combos first so they win over their bare-key siblings.
      if (matchesShortcut(e, 'lock_zoom')) {
        e.preventDefault()
        toggleLockZoom()
        return
      }
      if (matchesShortcut(e, 'lock_turn')) {
        e.preventDefault()
        toggleLockTurn()
        return
      }
      if (matchesShortcut(e, 'nav_next')) {
        e.preventDefault()
        navigateCandidate('next')
        return
      }
      if (matchesShortcut(e, 'nav_prev')) {
        e.preventDefault()
        navigateCandidate('prev')
        return
      }
      if (matchesShortcut(e, 'swap_compare')) {
        e.preventDefault()
        handleSwap()
        return
      }
      if (matchesShortcut(e, 'toggle_lock_ref')) {
        e.preventDefault()
        setLockReference((prev) => !prev)
        return
      }
      if (matchesShortcut(e, 'toggle_zoom')) {
        e.preventDefault()
        const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
        patchSlotView(activeSlot, current.zoom > 1 ? { zoom: 1, pan: { x: 0, y: 0 } } : { zoom: 2.5, pan: { x: 0, y: 0 } })
        return
      }
      // Mirrored-viewports toggle (Shift+S never collides with bare S/Swap).
      if (e.key.toLowerCase() === 's' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleSyncViewports()
        return
      }
      // Face Lock toggle (Shift+F never collides with bare F/zoom).
      if (e.key.toLowerCase() === 'f' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleFaceLock()
        return
      }
      // 4-up orientation toggle (O): switch to 4-up, or flip grid/landscape.
      if ((e.key === 'o' || e.key === 'O') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (layoutMode !== '4-up') {
          setLayoutModeAndStore('4-up')
        } else {
          const next = fourUpOrientation === 'grid' ? 'landscape' : 'grid'
          setFourUpOrientationAndStore(next)
          toast(`4-Up Layout: ${next === 'landscape' ? '1×4 Landscape Row' : '2×2 Quad Grid'}`, {
            id: '4up-ori',
            icon: next === 'landscape' ? '▥' : '⊞'
          })
        }
        return
      }
      // Direct slot ratings: 1/2/3/4 accept slots 0..3 (only when visible).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        const slot = Number(e.key) - 1
        if (slot < slotCount && comparePhotos[slot]) {
          e.preventDefault()
          void handleSetStatusAndAdvance(slot, 'accepted')
          return
        }
      }
      if (matchesShortcut(e, 'rate_accept')) {
        e.preventDefault()
        if (comparePhotos[activeSlot]) {
          void handleSetStatusAndAdvance(activeSlot, 'accepted')
        }
        return
      }
      if (matchesShortcut(e, 'rate_reject')) {
        e.preventDefault()
        // Reject the active viewport; the vacated pane auto-refills
        // (King of the Hill in 2-Up, slot refill in 3-Up/4-Up).
        if (comparePhotos[activeSlot]) {
          void handleSetStatusAndAdvance(activeSlot, 'rejected')
        }
        return
      }
      if (matchesShortcut(e, 'rate_pending')) {
        e.preventDefault()
        if (comparePhotos[activeSlot]) {
          handleSetStatus(comparePhotos[activeSlot].id, 'pending')
        }
        return
      }
      if (matchesShortcut(e, 'toggle_tag')) {
        e.preventDefault()
        const photo = comparePhotos[activeSlot]
        if (photo) {
          togglePhotoTag(photo.id)
          setComparePhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_tagged: !p.is_tagged } : p)))
        }
        return
      }
      if (matchesShortcut(e, 'rotate_cw')) {
        e.preventDefault()
        stepSlotRotation(activeSlot, 1)
        return
      }
      if (matchesShortcut(e, 'rotate_ccw')) {
        e.preventDefault()
        stepSlotRotation(activeSlot, -1)
        return
      }

      // Non-rebindable legacy keys.
      if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
        patchSlotView(activeSlot, current.zoom > 1 ? { zoom: 1, pan: { x: 0, y: 0 } } : { zoom: 2.5, pan: { x: 0, y: 0 } })
        return
      }
      if (e.key === 'Escape') {
        if (showMatchMenu) {
          setShowMatchMenu(false)
        } else {
          handleBack()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleBack, navigateCandidate, handleSetStatus, handleSetStatusAndAdvance, handleSwap, comparePhotos, slotViews, activeSlot, patchSlotView, showMatchMenu, stepSlotRotation, toggleLockZoom, toggleLockTurn, slotCount, toggleSyncViewports, toggleFaceLock, togglePhotoTag, layoutMode, fourUpOrientation, setLayoutModeAndStore, setFourUpOrientationAndStore])

  // Native Application Menu actions targeted at Compare
  useEffect(() => {
    const handleAppMenuAction = (e: Event) => {
      const { action, payload } = (e as CustomEvent).detail || {}
      switch (action) {
        case 'rate-accept':
          if (comparePhotos[activeSlot]) {
            void handleSetStatusAndAdvance(activeSlot, 'accepted')
          }
          break
        case 'rate-reject':
          if (comparePhotos[activeSlot]) {
            void handleSetStatusAndAdvance(activeSlot, 'rejected')
          }
          break
        case 'rate-skip':
          navigateCandidate('next')
          break
        case 'rate-pending':
          if (comparePhotos[activeSlot]) {
            handleSetStatus(comparePhotos[activeSlot].id, 'pending')
          }
          break
        case 'toggle-tag':
          if (comparePhotos[activeSlot]) {
            togglePhotoTag(comparePhotos[activeSlot].id)
            setComparePhotos(prev => prev.map(p => p.id === comparePhotos[activeSlot].id ? { ...p, is_tagged: !p.is_tagged } : p))
          }
          break
        case 'prev-photo':
          navigateCandidate('prev')
          break
        case 'next-photo':
          navigateCandidate('next')
          break
        case 'first-photo':
          if (storePhotos.length > 0) {
            const first = storePhotos[0]
            setActivePhotoId(first.id)
            setComparePhotos(prev => {
              const next = [...prev]
              if (next.length > activeSlot) next[activeSlot] = first
              return next
            })
          }
          break
        case 'last-photo':
          if (storePhotos.length > 0) {
            const last = storePhotos[storePhotos.length - 1]
            setActivePhotoId(last.id)
            setComparePhotos(prev => {
              const next = [...prev]
              if (next.length > activeSlot) next[activeSlot] = last
              return next
            })
          }
          break
        case 'toggle-zoom': {
          const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
          patchSlotView(activeSlot, current.zoom > 1 ? { zoom: 1, pan: { x: 0, y: 0 } } : { zoom: 2.5, pan: { x: 0, y: 0 } })
          break
        }
        case 'toggle-lock-zoom':
          toggleLockZoom()
          break
        case 'toggle-lock-turn':
          toggleLockTurn()
          break
        case 'rotate-cw':
          stepSlotRotation(activeSlot, 1)
          break
        case 'rotate-ccw':
          stepSlotRotation(activeSlot, -1)
          break
        case 'rotate-reset':
          patchSlotView(activeSlot, { rotation: 0 })
          break
        case 'zoom-fit':
          patchSlotView(activeSlot, { zoom: 1, pan: { x: 0, y: 0 } })
          break
        case 'zoom-100':
          patchSlotView(activeSlot, { zoom: 1, pan: { x: 0, y: 0 } })
          break
        case 'zoom-200':
          patchSlotView(activeSlot, { zoom: 2, pan: { x: 0, y: 0 } })
          break
        case 'zoom-in': {
          const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
          patchSlotView(activeSlot, { zoom: Math.min(4, current.zoom + 0.5) })
          break
        }
        case 'zoom-out': {
          const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
          patchSlotView(activeSlot, { zoom: Math.max(1, current.zoom - 0.5) })
          break
        }
        case 'reanalyze-active': {
          const activePhoto = comparePhotos[activeSlot]
          if (activePhoto) {
            toast(`Re-analyzing ${activePhoto.filename}...`, { icon: '🔄', id: 'reanalyze-compare' })
            api.reanalyzePhoto(activePhoto.id)
              .then((updated) => {
                setComparePhotos(prev => prev.map(p => p.id === updated.id ? updated : p))
                toast.success(`Re-analyzed ${activePhoto.filename}!`, { id: 'reanalyze-compare' })
              })
              .catch(() => toast.error('Re-analysis failed', { id: 'reanalyze-compare' }))
          }
          break
        }
        case 'match-zoom':
          handleMatchZoom()
          break
        case 'match-location':
          handleMatchLocation()
          break
        case 'match-rotation':
          handleMatchRotation()
          break
        case 'match-all':
          handleMatchAll()
          break
        case 'set-compare-layout': {
          const layout = typeof payload === 'string' ? payload : ''
          if (layout === '2-up' || layout === '3-up') {
            setLayoutModeAndStore(layout)
          } else if (layout === '4-up-grid') {
            setLayoutModeAndStore('4-up')
            setFourUpOrientationAndStore('grid')
          } else if (layout === '4-up-landscape' || layout === '4-up') {
            setLayoutModeAndStore('4-up')
            setFourUpOrientationAndStore('landscape')
          }
          break
        }
        case 'open-export':
        case 'quick-export':
          window.dispatchEvent(
            new CustomEvent('app:open-export', {
              detail: {
                selectedIds: comparePhotos.map(p => p.id),
                initialScope: 'accepted'
              }
            })
          )
          break
        case 'export-tagged':
          window.dispatchEvent(
            new CustomEvent('app:open-export', {
              detail: {
                selectedIds: comparePhotos.map(p => p.id),
                initialScope: 'tagged'
              }
            })
          )
          break
      }
    }

    window.addEventListener('app:menu-action', handleAppMenuAction)
    return () => window.removeEventListener('app:menu-action', handleAppMenuAction)
  }, [comparePhotos, activeSlot, handleSetStatus, handleSetStatusAndAdvance, slotViews, patchSlotView, stepSlotRotation, toggleLockZoom, toggleLockTurn, handleMatchZoom, handleMatchLocation, handleMatchRotation, handleMatchAll, navigateCandidate, togglePhotoTag, storePhotos, setActivePhotoId, setLayoutModeAndStore, setFourUpOrientationAndStore])

  // Drag to pan handling (per-slot: each comparison slot pans independently)
  const handleMouseDown = (e: React.MouseEvent, slot: number) => {
    const view = slotViews[slot] || DEFAULT_SLOT_VIEW
    if (view.zoom > 1) {
      setDragSlot(slot)
      setDragStart({ x: e.clientX - view.pan.x, y: e.clientY - view.pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragSlot !== null) {
      const view = slotViews[dragSlot] || DEFAULT_SLOT_VIEW
      if (view.zoom > 1) {
        patchSlotView(dragSlot, {
          pan: { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y },
        })
      }
    }
  }

  const handleMouseUp = () => {
    setDragSlot(null)
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 text-neutral-400">
        <FirstPassLoader size="md" label="Loading side-by-side comparison..." />
      </div>
    )
  }

  if (comparePhotos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 text-neutral-400 p-8">
        <p className="mb-4 text-sm font-medium">No photos selected for comparison.</p>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
        >
          Return to {returnTo.startsWith('/review') ? 'Review' : 'Gallery'}
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex-1 flex flex-col h-screen bg-neutral-950 text-neutral-100 overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Controls Toolbar */}
      <div className="min-h-12 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 z-20 shrink-0 overflow-x-auto [scrollbar-width:none]">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{returnTo.startsWith('/review') ? 'Back to Review' : 'Gallery'}</span>
          </button>

          <div className="h-4 w-px bg-neutral-800 shrink-0" />

          {/* Reference Lock Toggle */}
          <button
            onClick={() => setLockReference(!lockReference)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shrink-0 whitespace-nowrap',
              lockReference
                ? 'bg-blue-950/80 border-blue-500/70 text-blue-300 shadow-sm'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
            )}
            title="Lock left photo as reference benchmark and cycle candidates on the right (Hotkeys: ArrowLeft / ArrowRight, L to toggle)"
          >
            {lockReference ? <Lock size={12} className="text-blue-400" /> : <Unlock size={12} />}
            <span className="hidden md:inline">{lockReference ? 'Reference Locked' : 'Free Nav'}</span>
          </button>

          {/* Swap Sides / Promote Candidate Button (King of the Hill in 2-Up) */}
          <button
            onClick={handleSwap}
            disabled={comparePhotos.length < 2}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border bg-neutral-800 hover:bg-neutral-750 border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            title={layoutMode === '2-up'
              ? 'Promote Candidate (#2) to Reference (#1) and load the next challenger (Hotkey: S)'
              : 'Swap Reference (#1) and Candidate (#2) (Hotkey: S)'}
          >
            {layoutMode === '2-up'
              ? <Crown size={12} className="text-amber-400" />
              : <ArrowLeftRight size={12} className="text-blue-400" />}
            <span className="hidden sm:inline">{layoutMode === '2-up' ? 'Promote (S)' : 'Swap (S)'}</span>
          </button>

          {/* Multi-Up Layout Switcher */}
          <div
            className="flex items-center p-0.5 rounded-lg bg-neutral-950 border border-neutral-800 shrink-0"
            title="Multi-up comparison layout"
          >
            {(['2-up', '3-up', '4-up'] as LayoutMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSelectLayoutMode(mode)}
                className={clsx(
                  'px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer',
                  layoutMode === mode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                )}
                title={`${mode} comparison (${mode === '2-up' ? 'Reference + 1 candidate' : mode === '3-up' ? 'Reference + 2 candidates' : 'Reference + 3 candidates — click again to toggle 2×2 grid / 1×4 row'})`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* 4-up orientation toggle (grid vs landscape row) */}
          {layoutMode === '4-up' && (
            <div className="flex items-center p-0.5 rounded-lg bg-neutral-950 border border-neutral-800 shrink-0">
              <button
                onClick={() => setFourUpOrientationAndStore('grid')}
                className={clsx(
                  'px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1',
                  fourUpOrientation === 'grid'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                )}
                title="2×2 Quad Grid"
              >
                <span>⊞ Grid</span>
              </button>
              <button
                onClick={() => setFourUpOrientationAndStore('landscape')}
                className={clsx(
                  'px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1',
                  fourUpOrientation === 'landscape'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                )}
                title="1×4 Landscape Row (4 side-by-side)"
              >
                <span>▥ Landscape</span>
              </button>
            </div>
          )}

          {/* Sync Zoom, Pan & Rotate Toggle */}
          <button
            onClick={toggleSyncViewports}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shrink-0 whitespace-nowrap',
              syncViewports
                ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 shadow-sm'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
            )}
            title="Mirror zoom, pan & rotation across all viewports in real time (Shift+S)"
          >
            {syncViewports ? <Link2 size={12} className="text-emerald-400" /> : <Unlink size={12} />}
            <span className="hidden lg:inline">🔗 Sync Viewports</span>
          </button>

          {/* Face-Anchored Registration Toggle */}
          <button
            onClick={toggleFaceLock}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shrink-0 whitespace-nowrap',
              faceLock
                ? 'bg-amber-950/80 border-amber-500/70 text-amber-300 shadow-sm'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
            )}
            title="Face-anchored registration: when zoomed, each viewport centers on its own subject face (Shift+F)"
          >
            <span className={clsx('text-xs leading-none', !faceLock && 'grayscale opacity-70')}>🎯</span>
            <span className="hidden lg:inline">Face Lock</span>
          </button>

          {/* Hotkey Guide Pill */}
          <div className="hidden xl:flex items-center gap-2 text-[11px] text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-neutral-300 border border-neutral-700">←</kbd>
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-neutral-300 border border-neutral-700">→</kbd>
              <span>Cycle</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-blue-300 border border-blue-800">S</kbd>
              <span>Swap Ref</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-amber-300 border border-amber-800">⇧F</kbd>
              <span>Face Lock</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-emerald-300 border border-emerald-800">1{slotCount > 2 ? '-4' : '-2'}</kbd>
              <span>Keep Slot</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-rose-300 border border-rose-800">X</kbd>
              <span>Reject</span>
            </span>
            <span>·</span>
            <span className="text-[10px] text-neutral-400">
              <span className="text-neutral-300 font-medium">Shift+Click</span> filmstrip to set Ref
            </span>
          </div>
        </div>

        {/* Right Controls: Zoom, Match View & Filmstrip Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Per-Slot Zoom Controls (applies to the active slot) */}
          <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800 text-xs shrink-0">
            <button
              onClick={() => {
                const current = viewForSlot(activeSlot)
                const nextZoom = Math.max(1, current.zoom - 0.5)
                patchSlotView(activeSlot, nextZoom <= 1 ? { zoom: nextZoom, pan: { x: 0, y: 0 } } : { zoom: nextZoom })
              }}
              className="text-neutral-400 hover:text-white transition-colors p-1 cursor-pointer"
              title={`Zoom Out (${activeSlot === 0 ? 'Reference' : 'Candidate'} slot)`}
            >
              <ZoomOut size={13} />
            </button>
            <span className="font-mono text-indigo-400 w-11 text-center text-xs">
              {Math.round(viewForSlot(activeSlot).zoom * 100)}%
            </span>
            <button
              onClick={() => {
                const current = viewForSlot(activeSlot)
                patchSlotView(activeSlot, { zoom: Math.min(4, current.zoom + 0.5) })
              }}
              className="text-neutral-400 hover:text-white transition-colors p-1 cursor-pointer"
              title={`Zoom In (${activeSlot === 0 ? 'Reference' : 'Candidate'} slot)`}
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => {
                patchSlotView(activeSlot, { zoom: 1, pan: { x: 0, y: 0 } })
              }}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 px-1 py-0.5 rounded cursor-pointer font-medium"
              title="Reset Zoom & Pan for the active slot"
            >
              Reset
            </button>
          </div>

          {/* Adobe-style Match View dropdown (copies Reference view onto Candidate) */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowMatchMenu((prev) => !prev)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer',
                showMatchMenu
                  ? 'bg-neutral-700 border-neutral-600 text-white'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
              )}
              title="Match the Candidate view to the Reference (Zoom, Location, Rotation)"
            >
              <ArrowLeftRight size={12} className="text-teal-400" />
              <span>Match</span>
              <ChevronDown size={11} className="text-neutral-400" />
            </button>
            {showMatchMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMatchMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl overflow-hidden py-1">
                  <button
                    onClick={() => { handleMatchZoom(); setShowMatchMenu(false) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-xs text-neutral-200 cursor-pointer"
                  >
                    Match Zoom
                  </button>
                  <button
                    onClick={() => { handleMatchLocation(); setShowMatchMenu(false) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-xs text-neutral-200 cursor-pointer"
                  >
                    Match Location
                  </button>
                  <button
                    onClick={() => { handleMatchRotation(); setShowMatchMenu(false) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-xs text-neutral-200 cursor-pointer"
                  >
                    Match Rotation
                  </button>
                  <div className="my-1 h-px bg-neutral-800" />
                  <button
                    onClick={() => { handleMatchAll(); setShowMatchMenu(false) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-xs font-semibold text-neutral-100 cursor-pointer"
                  >
                    Match All
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Lock Zoom & Lock Turn Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleLockZoom}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer',
                lockZoom
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              )}
              title="Lock Zoom Between Photos (⇧⌘L)"
            >
              {lockZoom ? <Lock size={11} className="text-emerald-400" /> : <Unlock size={11} />}
              <span className="hidden lg:inline">{lockZoom ? 'Zoom Locked' : 'Lock Zoom'}</span>
            </button>
            <button
              onClick={toggleLockTurn}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer',
                lockTurn
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              )}
              title="Lock Turn Between Photos (⇧⌘T)"
            >
              {lockTurn ? <Lock size={11} className="text-emerald-400" /> : <Unlock size={11} />}
              <span className="hidden lg:inline">{lockTurn ? 'Turn Locked' : 'Lock Turn'}</span>
            </button>
          </div>

          {/* Toggle Filmstrip */}
          <button
            onClick={() => setShowFilmstrip(!showFilmstrip)}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 whitespace-nowrap',
              showFilmstrip
                ? 'bg-neutral-800 border-neutral-700 text-white'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            )}
            title="Toggle thumbnail filmstrip at bottom"
          >
            <Layers size={12} />
            <span className="hidden sm:inline">Filmstrip</span>
          </button>

          {/* Global Export Button */}
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('app:open-export', {
                  detail: {
                    selectedIds: comparePhotos.map(p => p.id),
                    initialScope: 'accepted'
                  }
                })
              )
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Export Culled Photos (Cmd+E)"
          >
            <FolderUp size={12} className="text-indigo-400" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Main Multi-Up Comparison Grid (mirrored pan/zoom/rotation when Sync is ON) */}
      <div className={clsx(
        'flex-1 grid gap-3 p-3 min-h-0 overflow-hidden',
        layoutMode === '2-up' && 'grid-cols-1 md:grid-cols-2',
        layoutMode === '3-up' && 'grid-cols-1 md:grid-cols-3',
        layoutMode === '4-up' && (fourUpOrientation === 'landscape' ? 'grid-cols-4 grid-rows-1' : 'grid-cols-2 grid-rows-2')
      )}>
        {comparePhotos.filter((p): p is Photo => Boolean(p && p.id)).slice(0, slotCount).map((photo, slotIdx) => {
          const isAccepted = photo.status === 'accepted'
          const isRejected = photo.status === 'rejected'
          const isRefSlot = slotIdx === 0
          const shootingParams = [photo.shutter_speed, photo.aperture, photo.iso ? `ISO ${photo.iso}` : null]
            .filter(Boolean)
            .join(' · ')
          // In 1x4 landscape each column is ~300-350px wide: hide verbose
          // labels (keep icons + tooltips) so header controls don't clip.
          const isCompactColumn = layoutMode === '4-up' && fourUpOrientation === 'landscape'

          return (
            <div
              key={`${photo.id}-${slotIdx}`}
              onClick={() => setActiveSlot(slotIdx)}
              className={clsx(
                'flex flex-col bg-neutral-900 border-2 rounded-2xl overflow-hidden transition-all duration-150',
                isAccepted
                  ? 'border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                  : isRejected
                  ? 'border-rose-500/80 opacity-75'
                  : isRefSlot && lockReference
                  ? 'border-blue-500/70 shadow-md shadow-blue-500/10'
                  : activeSlot === slotIdx
                  ? 'border-indigo-500/80'
                  : 'border-neutral-800',
                // Active viewport targeting ring — always visible so rating
                // keys (A/P/R/X/U/\) clearly apply to this slot.
                activeSlot === slotIdx && 'ring-2 ring-indigo-400/80 ring-offset-2 ring-offset-neutral-950'
              )}
            >
              {/* Photo Header with Camera EXIF & Actions */}
              <div className="p-2.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span
                    className={clsx(
                      'text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border',
                      isRefSlot && lockReference
                        ? 'bg-blue-950 text-blue-300 border-blue-600'
                        : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                    )}
                  >
                    {isRefSlot ? (isCompactColumn ? 'REF' : 'REFERENCE (#1)') : isCompactColumn ? `CAND (#${slotIdx + 1})` : `CANDIDATE (#${slotIdx + 1})`}
                  </span>
                  <span className={clsx('text-xs font-semibold text-white truncate', isCompactColumn ? 'max-w-[80px]' : 'max-w-[160px]')} title={photo.filename}>
                    {photo.filename}
                  </span>
                  {photo.is_burst_leader && (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold" title="Best Pick">
                      <Crown className="w-2.5 h-2.5" />
                      {!isCompactColumn && 'Best Pick'}
                    </span>
                  )}
                </div>

                {/* Keep / Reject Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Per-slot rotation (0 / 90 / 180 / 270) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRotateSlot(slotIdx)
                    }}
                    className="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-all cursor-pointer"
                    title={`Rotate this photo (currently ${viewForSlot(slotIdx).rotation}°)`}
                  >
                    <RotateCw className="w-3 h-3 text-neutral-400" />
                    <span>{viewForSlot(slotIdx).rotation}°</span>
                  </button>
                  {/* Promote Candidate to Reference button */}
                  {!isRefSlot ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSetReference(photo)
                      }}
                      className="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 bg-neutral-800 hover:bg-blue-600/30 text-neutral-300 hover:text-blue-300 border border-neutral-700 hover:border-blue-500/50 transition-all cursor-pointer"
                      title="Set this candidate as the Reference benchmark (#1)"
                    >
                      <Pin className="w-3 h-3 text-blue-400" />
                      {!isCompactColumn && <span>Set as Ref</span>}
                    </button>
                  ) : (
                    <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-blue-400 bg-blue-950/50 border border-blue-800/40" title="Benchmark reference">
                      <Pin className="w-3 h-3 fill-blue-400" />
                      {!isCompactColumn && <span>Benchmark</span>}
                    </span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetStatusAndAdvance(slotIdx, 'accepted')
                    }}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer',
                      isAccepted
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-neutral-800 hover:bg-emerald-600/30 text-neutral-300 hover:text-emerald-300 border border-neutral-700'
                    )}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isCompactColumn ? `${slotIdx + 1}` : `Keep ${slotIdx + 1}`}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetStatusAndAdvance(slotIdx, 'rejected')
                    }}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer',
                      isRejected
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-neutral-800 hover:bg-rose-600/30 text-neutral-300 hover:text-rose-300 border border-neutral-700'
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                    {!isCompactColumn && <span>Reject</span>}
                  </button>
                </div>
              </div>

              {/* Independent Image Canvas with Drag-to-Pan (per-slot zoom, location & rotation) */}
              <div
                ref={(el) => { slotContainerRefs.current[slotIdx] = el }}
                className={clsx(
                  'flex-1 bg-black relative flex items-center justify-center overflow-hidden',
                  viewForSlot(slotIdx).zoom > 1 ? (dragSlot === slotIdx ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                )}
                onMouseDown={(e) => handleMouseDown(e, slotIdx)}
              >
                <img
                  src={getRamCachedImageUrl(photo.id) ?? api.getFullImageUrl(photo.id)}
                  alt={photo.filename}
                  style={{
                    transform: `translate(${viewForSlot(slotIdx).pan.x}px, ${viewForSlot(slotIdx).pan.y}px) rotate(${viewForSlot(slotIdx).rotation}deg) scale(${viewForSlot(slotIdx).zoom})`,
                    transformOrigin: 'center center',
                    transition: dragSlot === slotIdx ? 'none' : 'transform 0.12s ease-out',
                  }}
                  className="max-h-full max-w-full object-contain pointer-events-none select-none"
                  draggable={false}
                />

                {/* Score & Attributes Badge */}
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2 py-1 rounded-lg border border-neutral-800 text-xs font-mono font-bold">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Score: {Math.round(photo.overall_score || 0)}</span>
                  {photo.face_count != null && photo.face_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-neutral-400 ml-1">
                      <Users size={11} className="text-indigo-300" />
                      <span>{photo.face_count}</span>
                    </span>
                  )}
                </div>

                {/* Previous / Next Candidate arrows overlay on right slot */}
                {!isRefSlot && (
                  <div className="absolute inset-y-0 inset-x-2 flex items-center justify-between pointer-events-none">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigateCandidate('prev')
                      }}
                      className="pointer-events-auto p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 transition-all backdrop-blur cursor-pointer shadow-lg"
                      title="Previous candidate (ArrowLeft)"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigateCandidate('next')
                      }}
                      className="pointer-events-auto p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 transition-all backdrop-blur cursor-pointer shadow-lg"
                      title="Next candidate (ArrowRight)"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom EXIF & Scoring Metrics */}
              <div className="p-2.5 bg-neutral-900 border-t border-neutral-800 text-xs space-y-1.5 shrink-0">
                {shootingParams && (
                  <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-[11px]">
                    <Camera className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{shootingParams}</span>
                  </div>
                )}

                <div className={clsx('grid gap-2 pt-1 border-t border-neutral-800/80 text-[11px]', isCompactColumn ? 'grid-cols-2' : 'grid-cols-4')}>
                  <div>
                    <span className="text-neutral-500">Sharpness: </span>
                    <span className={clsx('font-semibold', photo.is_blurry ? 'text-rose-400' : 'text-emerald-400')}>
                      {Math.round(photo.blur_score || 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Exposure: </span>
                    <span className="font-semibold text-neutral-300">
                      {Math.round(photo.exposure_score || 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Aesthetic: </span>
                    <span className="font-semibold text-neutral-300">
                      {Math.round(photo.aesthetic_score || 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Focus: </span>
                    <span className="font-semibold text-sky-400">
                      {photo.is_bokeh ? 'Bokeh' : photo.face_count ? 'Face' : 'Center'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom Horizontal Filmstrip */}
      {showFilmstrip && storePhotos.length > 0 && (
        <div
          ref={filmstripRef}
          className="h-20 bg-neutral-900/95 border-t border-neutral-800 px-3 flex items-center gap-2 overflow-x-auto shrink-0 z-20"
        >
          {storePhotos.map((p, idx) => {
            const isRef = comparePhotos[0]?.id === p.id
            const slottedIdx = comparePhotos.findIndex((q) => q?.id === p.id)
            const isCand = slottedIdx > 0 && slottedIdx < slotCount
            const isDimmedRejected = p.status === 'rejected' && !isRef && !isCand

            return (
              <div
                key={p.id}
                id={`filmstrip-${p.id}`}
                onClick={(e) => {
                  if (e.shiftKey) {
                    handleSetReference(p)
                  } else if (slottedIdx !== -1) {
                    // Already slotted — focus that viewport.
                    setActiveSlot(Math.min(slottedIdx, slotCount - 1))
                  } else {
                    // Place into the active slot viewport.
                    setActivePhotoId(p.id)
                    setComparePhotos((prev) => {
                      const next = [...prev]
                      while (next.length <= activeSlot) next.push(p)
                      next[activeSlot] = p
                      return next
                    })
                  }
                }}
                className={clsx(
                  'group h-16 w-24 rounded-lg overflow-hidden relative cursor-pointer border-2 transition-all shrink-0 bg-neutral-950 flex items-center justify-center',
                  isRef
                    ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                    : isCand
                    ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-lg'
                    : isDimmedRejected
                    ? 'border-neutral-800 opacity-25 grayscale-[60%] hover:opacity-80 hover:grayscale-0'
                    : 'border-neutral-800 hover:border-neutral-600 opacity-70 hover:opacity-100'
                )}
                title={`Photo #${idx + 1}: ${p.filename} (Click to load into the active slot, Shift+Click or Pin to set as reference)`}
              >
                <img
                  src={api.getThumbnailUrl(p.id)}
                  alt={p.filename}
                  className="w-full h-full object-cover pointer-events-none"
                  decoding="async"
                />

                {/* Badges */}
                <div className="absolute top-1 left-1 flex items-center gap-1">
                  {isRef && (
                    <span className="bg-blue-600 text-white text-[8px] font-black px-1 rounded shadow">
                      REF
                    </span>
                  )}
                  {isCand && (
                    <span className="bg-purple-600 text-white text-[8px] font-black px-1 rounded shadow">
                      CAND
                    </span>
                  )}
                  {isDimmedRejected && (
                    <span className="bg-rose-600/90 text-white text-[8px] font-black px-1 rounded shadow" title="Rejected">
                      ✕
                    </span>
                  )}
                </div>

                {/* Pin as Reference Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSetReference(p)
                  }}
                  className={clsx(
                    'absolute top-1 right-1 p-1 rounded bg-black/80 hover:bg-blue-600 text-neutral-300 hover:text-white transition-all cursor-pointer z-10',
                    isRef ? 'text-blue-400 opacity-100 ring-1 ring-blue-400' : 'opacity-0 group-hover:opacity-100'
                  )}
                  title="Pin as Reference (#1) (or Shift+Click)"
                >
                  <Pin size={9} className={isRef ? 'fill-blue-400' : ''} />
                </button>

                <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[8px] font-mono font-bold text-white">
                  {Math.round(p.overall_score || 0)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Compare
