import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, X, ZoomIn, ZoomOut, Crown, Camera, Sparkles,
  Lock, Unlock, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2,
  Users, Eye, Layers, RotateCcw, RotateCw, ArrowLeftRight, Pin, FolderUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
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
  // Slot 0 is the Reference, slot 1 is the Candidate.
  interface SlotView {
    zoom: number
    pan: { x: number; y: number }
    rotation: 0 | 90 | 180 | 270
  }
  const DEFAULT_SLOT_VIEW: SlotView = { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 }
  const [slotViews, setSlotViews] = useState<SlotView[]>([{ ...DEFAULT_SLOT_VIEW }, { ...DEFAULT_SLOT_VIEW }])
  const [dragSlot, setDragSlot] = useState<number | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [showFilmstrip, setShowFilmstrip] = useState<boolean>(true)
  const [showMatchMenu, setShowMatchMenu] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const viewForSlot = (slot: number): SlotView => slotViews[slot] || DEFAULT_SLOT_VIEW

  const patchSlotView = useCallback((slot: number, patch: Partial<SlotView>) => {
    setSlotViews((prev) => {
      const base = prev[slot] || DEFAULT_SLOT_VIEW
      const next = [...prev]
      next[slot] = {
        ...base,
        ...patch,
        pan: patch.pan ? { ...patch.pan } : { ...base.pan },
      }
      return next
    })
  }, [])

  // Adobe-style Match commands: copy the Reference (slot 0) view onto the Candidate (slot 1)
  const handleMatchZoom = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0] || !prev[1]) return prev
      const next = [...prev]
      next[1] = { ...next[1], zoom: next[0].zoom }
      return next
    })
    toast.success('Matched Zoom across photographs', { id: 'match-view' })
  }, [])

  const handleMatchLocation = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0] || !prev[1]) return prev
      const next = [...prev]
      next[1] = { ...next[1], pan: { ...next[0].pan } }
      return next
    })
    toast.success('Matched Location across photographs', { id: 'match-view' })
  }, [])

  const handleMatchRotation = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0] || !prev[1]) return prev
      const next = [...prev]
      next[1] = { ...next[1], rotation: next[0].rotation }
      return next
    })
    toast.success('Matched Rotation across photographs', { id: 'match-view' })
  }, [])

  const handleMatchAll = useCallback(() => {
    setSlotViews((prev) => {
      if (prev.length < 2 || !prev[0] || !prev[1]) return prev
      const next = [...prev]
      next[1] = { ...next[1], zoom: next[0].zoom, pan: { ...next[0].pan }, rotation: next[0].rotation }
      return next
    })
    toast.success('Matched Zoom & Location across photographs', { id: 'match-view' })
  }, [])

  const handleRotateSlot = useCallback((slot: number) => {
    setSlotViews((prev) => {
      const base = prev[slot] || DEFAULT_SLOT_VIEW
      const order: SlotView['rotation'][] = [0, 90, 180, 270]
      const nextRotation = order[(order.indexOf(base.rotation) + 1) % order.length]
      const next = [...prev]
      next[slot] = { ...base, rotation: nextRotation }
      return next
    })
  }, [])

  const filmstripRef = useRef<HTMLDivElement>(null)

  // Ensure store photos are loaded if directly opening Compare
  useEffect(() => {
    if (storePhotos.length === 0) {
      fetchPhotos().catch(() => {})
    }
  }, [storePhotos.length, fetchPhotos])

  // Initialize comparison photos
  useEffect(() => {
    const idsParam = searchParams.get('ids')
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
  const handleSetStatus = useCallback(async (id: number, status: 'accepted' | 'rejected') => {
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

  // Set a specific photo as reference (Slot 0)
  const handleSetReference = useCallback((photo: Photo) => {
    setComparePhotos((prev) => {
      if (prev.length === 0) return [photo]
      if (prev[1]?.id === photo.id) {
        return [photo, prev[0] || photo]
      }
      return [photo, prev[1] || prev[0] || photo]
    })
    toast.success(`Set ${photo.filename} as Reference (#1)`, { id: 'ref-photo' })
  }, [])

  // Swap Slot 0 (Ref) and Slot 1 (Candidate)
  const handleSwap = useCallback(() => {
    setComparePhotos((prev) => {
      if (prev.length < 2) return prev
      return [prev[1], prev[0]]
    })
    toast.success('Swapped Reference & Candidate', { id: 'ref-photo' })
  }, [])

  // Candidate navigation
  const navigateCandidate = useCallback((direction: 'next' | 'prev') => {
    if (storePhotos.length === 0 || comparePhotos.length === 0) return

    const targetSlot = lockReference ? 1 : activeSlot
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

    // Scroll filmstrip thumbnail into view
    const thumbEl = document.getElementById(`filmstrip-${newPhoto.id}`)
    if (thumbEl) {
      thumbEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [storePhotos, comparePhotos, lockReference, activeSlot])

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          navigateCandidate('next')
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigateCandidate('prev')
          break
        case '1':
          if (comparePhotos[0]) {
            handleSetStatus(comparePhotos[0].id, 'accepted')
          }
          break
        case '2':
          if (comparePhotos[1]) {
            handleSetStatus(comparePhotos[1].id, 'accepted')
          }
          break
        case 'x':
        case 'X':
          // Reject candidate and advance
          if (comparePhotos[1]) {
            handleSetStatus(comparePhotos[1].id, 'rejected')
            navigateCandidate('next')
          }
          break
        case 's':
        case 'S':
          e.preventDefault()
          handleSwap()
          break
        case 'l':
        case 'L':
          setLockReference((prev) => !prev)
          break
        case 'z':
        case 'Z':
        case 'f':
        case 'F': {
          const current = slotViews[activeSlot] || DEFAULT_SLOT_VIEW
          patchSlotView(activeSlot, current.zoom > 1 ? { zoom: 1, pan: { x: 0, y: 0 } } : { zoom: 2.5, pan: { x: 0, y: 0 } })
          break
        }
        case 'Escape':
          if (showMatchMenu) {
            setShowMatchMenu(false)
          } else {
            handleBack()
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleBack, navigateCandidate, handleSetStatus, handleSwap, comparePhotos, slotViews, activeSlot, patchSlotView, showMatchMenu])

  // Native Application Menu actions targeted at Compare
  useEffect(() => {
    const handleAppMenuAction = (e: Event) => {
      const { action } = (e as CustomEvent).detail || {}
      switch (action) {
        case 'rate-accept':
          if (comparePhotos[activeSlot]) {
            handleSetStatus(comparePhotos[activeSlot].id, 'accepted')
          }
          break
        case 'rate-reject':
          if (comparePhotos[1]) {
            handleSetStatus(comparePhotos[1].id, 'rejected')
          }
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
  }, [comparePhotos, activeSlot, handleSetStatus, slotViews, patchSlotView, handleMatchZoom, handleMatchLocation, handleMatchRotation, handleMatchAll, navigateCandidate, togglePhotoTag, storePhotos, setActivePhotoId])

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
      <div className="h-13 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 flex items-center justify-between px-4 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{returnTo.startsWith('/review') ? 'Back to Review' : 'Gallery'}</span>
          </button>

          <div className="h-4 w-px bg-neutral-800" />

          {/* Reference Lock Toggle */}
          <button
            onClick={() => setLockReference(!lockReference)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer',
              lockReference
                ? 'bg-blue-950/80 border-blue-500/70 text-blue-300 shadow-sm'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
            )}
            title="Lock left photo as reference benchmark and cycle candidates on the right (Hotkeys: ArrowLeft / ArrowRight, L to toggle)"
          >
            {lockReference ? <Lock size={12} className="text-blue-400" /> : <Unlock size={12} />}
            <span>{lockReference ? 'Reference Locked (Left)' : 'Free Navigation'}</span>
          </button>

          {/* Swap Sides / Promote Candidate Button */}
          <button
            onClick={handleSwap}
            disabled={comparePhotos.length < 2}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border bg-neutral-800 hover:bg-neutral-750 border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Swap Reference (#1) and Candidate (#2) (Hotkey: S)"
          >
            <ArrowLeftRight size={12} className="text-blue-400" />
            <span>Swap (S)</span>
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
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-emerald-300 border border-emerald-800">1</kbd>
              <span>Keep Left</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 bg-neutral-800 rounded text-[10px] text-emerald-300 border border-emerald-800">2</kbd>
              <span>Keep Right</span>
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
        <div className="flex items-center gap-2">
          {/* Per-Slot Zoom Controls (applies to the active slot) */}
          <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800 text-xs">
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
          <div className="relative">
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

          {/* Toggle Filmstrip */}
          <button
            onClick={() => setShowFilmstrip(!showFilmstrip)}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer',
              showFilmstrip
                ? 'bg-neutral-800 border-neutral-700 text-white'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            )}
            title="Toggle thumbnail filmstrip at bottom"
          >
            <Layers size={12} />
            <span>Filmstrip</span>
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
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer"
            title="Export Culled Photos (Cmd+E)"
          >
            <FolderUp size={12} className="text-indigo-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Main Side-by-Side Comparison Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 min-h-0 overflow-hidden">
        {comparePhotos.filter((p): p is Photo => Boolean(p && p.id)).map((photo, slotIdx) => {
          const isAccepted = photo.status === 'accepted'
          const isRejected = photo.status === 'rejected'
          const isRefSlot = slotIdx === 0
          const shootingParams = [photo.shutter_speed, photo.aperture, photo.iso ? `ISO ${photo.iso}` : null]
            .filter(Boolean)
            .join(' · ')

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
                  : 'border-neutral-800'
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
                    {isRefSlot ? 'REFERENCE (#1)' : 'CANDIDATE (#2)'}
                  </span>
                  <span className="text-xs font-semibold text-white truncate max-w-[160px]" title={photo.filename}>
                    {photo.filename}
                  </span>
                  {photo.is_burst_leader && (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      <Crown className="w-2.5 h-2.5" />
                      Best Pick
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
                      title="Set this candidate as the Reference benchmark (#1) (Hotkey: S)"
                    >
                      <Pin className="w-3 h-3 text-blue-400" />
                      <span>Set as Ref</span>
                    </button>
                  ) : (
                    <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-blue-400 bg-blue-950/50 border border-blue-800/40">
                      <Pin className="w-3 h-3 fill-blue-400" />
                      <span>Benchmark</span>
                    </span>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSetStatus(photo.id, 'accepted')
                    }}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer',
                      isAccepted
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-neutral-800 hover:bg-emerald-600/30 text-neutral-300 hover:text-emerald-300 border border-neutral-700'
                    )}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Keep {slotIdx + 1}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSetStatus(photo.id, 'rejected')
                      if (!isRefSlot || !lockReference) {
                        navigateCandidate('next')
                      }
                    }}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer',
                      isRejected
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-neutral-800 hover:bg-rose-600/30 text-neutral-300 hover:text-rose-300 border border-neutral-700'
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Independent Image Canvas with Drag-to-Pan (per-slot zoom, location & rotation) */}
              <div
                className={clsx(
                  'flex-1 bg-black relative flex items-center justify-center overflow-hidden',
                  viewForSlot(slotIdx).zoom > 1 ? (dragSlot === slotIdx ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                )}
                onMouseDown={(e) => handleMouseDown(e, slotIdx)}
              >
                <img
                  src={api.getFullImageUrl(photo.id)}
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

                <div className="grid grid-cols-4 gap-2 pt-1 border-t border-neutral-800/80 text-[11px]">
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
            const isCand = comparePhotos[1]?.id === p.id

            return (
              <div
                key={p.id}
                id={`filmstrip-${p.id}`}
                onClick={(e) => {
                  if (e.shiftKey) {
                    handleSetReference(p)
                  } else {
                    // Set as candidate
                    setComparePhotos((prev) => [prev[0] || p, p])
                  }
                }}
                className={clsx(
                  'group h-16 w-24 rounded-lg overflow-hidden relative cursor-pointer border-2 transition-all shrink-0 bg-neutral-950 flex items-center justify-center',
                  isRef
                    ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                    : isCand
                    ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-lg'
                    : 'border-neutral-800 hover:border-neutral-600 opacity-70 hover:opacity-100'
                )}
                title={`Photo #${idx + 1}: ${p.filename} (Click to set as candidate, Shift+Click or Pin to set as reference)`}
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
