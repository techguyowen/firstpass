import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  FolderPlus, RotateCcw, RotateCw, CheckCircle2, XCircle, Clock,
  RefreshCw, Columns, FolderUp, Bookmark, Target, Sparkles, Search, Layers, BarChart2, Star,
  Eye, Paintbrush, Crosshair, SlidersHorizontal, X
} from 'lucide-react'
import { usePhotosStore } from '../store/photosStore'
import { matchesShortcut, subscribeShortcuts } from '../utils/shortcutsManager'
import { playShutterSound, playRejectSound, playResetSound } from '../utils/audioFeedback'
import { STRICTNESS_PRESETS, closestStrictnessIndex } from '../utils/strictness'
import { api } from '../api/client'
import type { Photo } from '../types/photo'
import PhotoCard from '../components/PhotoCard'
import FilterBar from '../components/FilterBar'
import ProgressModal from '../components/ProgressModal'
import WelcomeScreen from '../components/WelcomeScreen'
import TargetDeliveryModal from '../components/TargetDeliveryModal'
import ViewOptionsMenu from '../components/ViewOptionsMenu'
import QuickLoupeModal from '../components/QuickLoupeModal'
import StatsModal from '../components/StatsModal'
import VipFacesModal from '../components/VipFacesModal'
import BurstGroupModal from '../components/BurstGroupModal'
import ShootSummaryBar from '../components/ShootSummaryBar'
import PhotoContextMenu from '../components/PhotoContextMenu'

type VirtualItem =
  | { type: 'header'; title: string; count: number }
  | { type: 'row'; photos: Photo[]; startIndex: number }

export default function Gallery() {
  const navigate = useNavigate()
  const {
    photos, totalPhotos, libraryTotal, folders, filters, setFilters, isScanning, isAnalyzing,
    scanProgress, analyzeProgress, gpuAvailable, gpuType, settings, viewOptions, setViewOptions,
    startScan, startAnalysis, startReanalysis, loadPhotos, updatePhotoStatusLocal,
    setPhotoStatusWithUndo, undo, redo, undoStack, redoStack, lastReviewedPhotoId,
    activePhotoId, setActivePhotoId, autoAdvance, toggleAutoAdvance, togglePhotoTag, resetLibrary
  } = usePhotosStore()

  const columnCount = viewOptions.columns || 4
  const cardHeight = columnCount === 3 ? 275 : columnCount === 4 ? 235 : columnCount === 5 ? 205 : 180

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null)
  const [stats, setStats] = useState({ accepted: 0, rejected: 0, pending: 0 })
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)

  // Cull to Target modal state
  const [showCullToTarget, setShowCullToTarget] = useState(false)
  const [cullTarget, setCullTarget] = useState(100)
  const [cullApplying, setCullApplying] = useState(false)

  // Spray Can (paint selections) state
  const [sprayMode, setSprayMode] = useState(false)
  const [sprayAction, setSprayAction] = useState<'accepted' | 'rejected'>('accepted')
  const [isSpraying, setIsSpraying] = useState(false)
  const sprayedIdsRef = useRef<Set<number>>(new Set())
  const sprayActionRef = useRef<'accepted' | 'rejected'>('accepted')
  sprayActionRef.current = sprayAction

  const strictnessIdx = settings
    ? closestStrictnessIndex(settings.auto_accept_threshold, settings.min_overall_score)
    : 2

  const openExport = (initialScope?: 'accepted' | 'tagged' | 'tagged_selected' | 'rejected' | 'selected') => {
    window.dispatchEvent(
      new CustomEvent('app:open-export', {
        detail: {
          selectedIds: Array.from(selected),
          initialScope: initialScope || (selected.size > 0 ? 'selected' : 'accepted')
        }
      })
    )
  }
  const [showQuickLoupe, setShowQuickLoupe] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showVipModal, setShowVipModal] = useState(false)
  const [burstModalGroup, setBurstModalGroup] = useState<{ groupId: string; photos: Photo[]; groupType?: 'burst' | 'variation' | 'similar' | null } | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number>(0)
  const [expandedBursts, setExpandedBursts] = useState<Set<string>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)

  // Pro right-click menu state for gallery thumbnails.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photo: Photo } | null>(null)

  // Compute burst counts across current photos
  const burstCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of photos) {
      if (p.burst_group_id) {
        map.set(p.burst_group_id, (map.get(p.burst_group_id) || 0) + 1)
      }
    }
    return map
  }, [photos])

  const toggleBurst = useCallback((burstId: string) => {
    setExpandedBursts(prev => {
      const next = new Set(prev)
      if (next.has(burstId)) next.delete(burstId)
      else next.add(burstId)
      return next
    })
  }, [])

  // Filter photos for display (burst stacking)
  const displayedPhotos = useMemo(() => {
    if (viewOptions.collapseBursts === false) return photos
    return photos.filter(p => {
      if (!p.burst_group_id) return true
      const count = burstCounts.get(p.burst_group_id) || 0
      if (count <= 1) return true
      // If user manually expanded this burst, show all
      if (expandedBursts.has(p.burst_group_id)) return true
      // Otherwise only show the designated hero/leader
      if (p.is_burst_leader) return true
      // Fallback: if no leader flag, show the first photo in the burst
      const first = photos.find(x => x.burst_group_id === p.burst_group_id)
      return first?.id === p.id
    })
  }, [photos, viewOptions.collapseBursts, expandedBursts, burstCounts])

  // Keep focusedIdx within bounds
  useEffect(() => {
    if (displayedPhotos.length > 0 && focusedIdx >= displayedPhotos.length) {
      setFocusedIdx(displayedPhotos.length - 1)
    }
  }, [displayedPhotos.length, focusedIdx])

  // Group displayed photos into rows and chapter headers for virtualizer
  const virtualItems = useMemo<VirtualItem[]>(() => {
    if (displayedPhotos.length === 0) return []

    const isChronological = filters.sort_by === 'date_asc' || filters.sort_by === 'date_desc'
    const hasScenes = (settings?.enable_scene_chapters ?? true) && (viewOptions.showChapters ?? true) && isChronological && displayedPhotos.some(p => Boolean(p.scene_name))

    if (!hasScenes) {
      const items: VirtualItem[] = []
      for (let i = 0; i < displayedPhotos.length; i += columnCount) {
        items.push({
          type: 'row',
          photos: displayedPhotos.slice(i, i + columnCount),
          startIndex: i,
        })
      }
      return items
    }

    const items: VirtualItem[] = []
    let currentScene: string | null = null
    let scenePhotos: Photo[] = []
    let currentStartOffset = 0

    const flushScene = (sceneName: string | null, list: Photo[], startOffset: number) => {
      if (list.length === 0) return
      if (sceneName) {
        items.push({
          type: 'header',
          title: sceneName,
          count: list.length,
        })
      }
      for (let i = 0; i < list.length; i += columnCount) {
        items.push({
          type: 'row',
          photos: list.slice(i, i + columnCount),
          startIndex: startOffset + i,
        })
      }
    }

    displayedPhotos.forEach((photo, idx) => {
      const sName = photo.scene_name || 'General'
      if (currentScene === null) {
        currentScene = sName
        scenePhotos = [photo]
        currentStartOffset = idx
      } else if (currentScene === sName) {
        scenePhotos.push(photo)
      } else {
        flushScene(currentScene, scenePhotos, currentStartOffset)
        currentScene = sName
        scenePhotos = [photo]
        currentStartOffset = idx
      }
    })

    if (scenePhotos.length > 0) {
      flushScene(currentScene, scenePhotos, currentStartOffset)
    }

    return items
  }, [displayedPhotos, columnCount, viewOptions.showChapters, settings?.enable_scene_chapters, filters.sort_by])

  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => virtualItems[index]?.type === 'header' ? 48 : cardHeight,
    overscan: 8,
  })

  // Auto-scroll virtualizer to keep focused card visible
  useEffect(() => {
    if (displayedPhotos.length === 0) return
    const rowIdx = virtualItems.findIndex(
      item => item.type === 'row' && item.startIndex <= focusedIdx && focusedIdx < item.startIndex + item.photos.length
    )
    if (rowIdx !== -1) {
      rowVirtualizer.scrollToIndex(rowIdx, { align: 'auto' })
    }
  }, [focusedIdx, virtualItems, rowVirtualizer, displayedPhotos.length])

  // Load photos & stats on mount / filter change
  useEffect(() => {
    loadPhotos()
  }, [filters])

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
  }, [photos])

  // Synchronize focus and scroll with activePhotoId / lastReviewedPhotoId
  useEffect(() => {
    const targetId = activePhotoId || lastReviewedPhotoId
    if (targetId && displayedPhotos.length > 0) {
      const idx = displayedPhotos.findIndex(p => p.id === targetId)
      if (idx !== -1) {
        setFocusedIdx(idx)
        const rowIdx = virtualItems.findIndex(
          item => item.type === 'row' && item.startIndex <= idx && idx < item.startIndex + item.photos.length
        )
        if (rowIdx !== -1) {
          rowVirtualizer.scrollToIndex(rowIdx, { align: 'center' })
        }
      }
    }
  }, [activePhotoId, lastReviewedPhotoId, displayedPhotos.length, virtualItems.length])

  // Broadcast focused photo as active photo across tabs
  useEffect(() => {
    if (displayedPhotos[focusedIdx]) {
      setActivePhotoId(displayedPhotos[focusedIdx].id)
    }
  }, [focusedIdx, displayedPhotos])

  // Re-render live key bindings when shortcuts change.
  const [, setShortcutsVersion] = useState(0)
  useEffect(() => subscribeShortcuts(() => setShortcutsVersion(v => v + 1)), [])

  // Global Keyboard Triage & Undo/Redo Shortcuts (rebindable via shortcutsManager)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return
      }

      // Undo / Redo (customizable; Cmd+Shift+Z falls to redo)
      if (matchesShortcut(e, 'undo')) {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if (matchesShortcut(e, 'redo')) {
        e.preventDefault()
        redo()
        return
      }

      if (e.key === 'CapsLock') {
        e.preventDefault()
        toggleAutoAdvance()
        return
      }

      // Pause grid hotkeys if modal overlays are active
      if (showQuickLoupe || showDeliveryModal || showCullToTarget) return
      if (displayedPhotos.length === 0) return

      // Survey Mode / Spray Can (rebindable via the Shortcuts modal).
      if (matchesShortcut(e, 'open_survey')) {
        e.preventDefault()
        navigate('/survey')
        return
      }
      if (matchesShortcut(e, 'toggle_spray')) {
        e.preventDefault()
        setSprayMode(prev => !prev)
        return
      }
      if (sprayMode && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setSprayAction('accepted')
        return
      }
      if (sprayMode && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        setSprayAction('rejected')
        return
      }

      const curPhoto = displayedPhotos[focusedIdx]

      if (matchesShortcut(e, 'nav_next') || e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + (e.key === 'ArrowDown' ? columnCount : 1)))
        return
      }
      if (matchesShortcut(e, 'nav_prev') || e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx(prev => Math.max(0, prev - (e.key === 'ArrowUp' ? columnCount : 1)))
        return
      }
      if (matchesShortcut(e, 'jump_next_pending')) {
        e.preventDefault()
        const after = displayedPhotos.findIndex((p, i) => i > focusedIdx && p.status === 'pending')
        const targetIdx = after !== -1 ? after : displayedPhotos.findIndex(p => p.status === 'pending')
        if (targetIdx === -1) {
          toast('No unreviewed photos left', { icon: '✅', id: 'jump-pending' })
        } else if (targetIdx === focusedIdx) {
          toast('Already on the only unreviewed photo', { icon: '📍', id: 'jump-pending' })
        } else {
          setFocusedIdx(targetIdx)
        }
        return
      }
      if (matchesShortcut(e, 'jump_next_flagged')) {
        e.preventDefault()
        const isFlagged = (p: Photo) => p.is_blurry === true || p.has_closed_eyes === true
        const after = displayedPhotos.findIndex((p, i) => i > focusedIdx && isFlagged(p))
        const targetIdx = after !== -1 ? after : displayedPhotos.findIndex(isFlagged)
        if (targetIdx === -1) {
          toast('No flagged photos (blur / closed eyes)', { icon: '✅', id: 'jump-flagged' })
        } else if (targetIdx === focusedIdx) {
          toast('Already on the only flagged photo', { icon: '📍', id: 'jump-flagged' })
        } else {
          setFocusedIdx(targetIdx)
        }
        return
      }
      if (matchesShortcut(e, 'toggle_tag')) {
        e.preventDefault()
        if (curPhoto) {
          togglePhotoTag(curPhoto.id)
          if (autoAdvance) {
            setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          }
        }
        return
      }
      if (matchesShortcut(e, 'rate_accept')) {
        e.preventDefault()
        if (curPhoto) {
          playShutterSound()
          setPhotoStatusWithUndo(curPhoto.id, 'accepted')
          if (autoAdvance) {
            setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          }
        }
        return
      }
      if (matchesShortcut(e, 'rate_reject')) {
        e.preventDefault()
        if (curPhoto) {
          playRejectSound()
          setPhotoStatusWithUndo(curPhoto.id, 'rejected')
          if (autoAdvance) {
            setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          }
        }
        return
      }
      if (matchesShortcut(e, 'rate_pending')) {
        e.preventDefault()
        if (curPhoto) {
          playResetSound()
          setPhotoStatusWithUndo(curPhoto.id, 'pending')
        }
        return
      }

      // Non-rebindable gallery keys.
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (curPhoto) setShowQuickLoupe(true)
          break
        case 'Enter':
          e.preventDefault()
          if (curPhoto) navigate(`/review/${curPhoto.id}`)
          break
        case 'c':
        case 'C':
          e.preventDefault()
          if (selected.size >= 2) {
            const ids = Array.from(selected).slice(0, 2).join(',')
            navigate(`/compare?ids=${ids}&returnTo=/`)
          } else if (curPhoto) {
            const nextPhoto = displayedPhotos[focusedIdx + 1] || displayedPhotos[focusedIdx - 1]
            if (nextPhoto) {
              navigate(`/compare?ids=${curPhoto.id},${nextPhoto.id}&returnTo=/`)
            } else {
              navigate(`/compare?ids=${curPhoto.id}&returnTo=/`)
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    displayedPhotos,
    focusedIdx,
    columnCount,
    showQuickLoupe,
    showDeliveryModal,
    showCullToTarget,
    sprayMode,
    undo,
    redo,
    setPhotoStatusWithUndo,
    navigate,
    autoAdvance,
    toggleAutoAdvance,
    togglePhotoTag,
    selected,
  ])

  // Native Application Menu actions targeted at Gallery
  useEffect(() => {
    const handleAppMenuAction = async (e: Event) => {
      const { action } = (e as CustomEvent).detail || {}
      switch (action) {
        case 'open-export':
          openExport('accepted')
          break
        case 'quick-export':
          openExport('accepted')
          break
        case 'export-tagged':
          openExport('tagged')
          break
        case 'auto-pick-duplicates': {
          toast('Auto-picking best duplicates...', { icon: '🏆', id: 'auto-pick-toast' })
          try {
            const res = await api.autoPickDuplicates()
            if (res && res.success) {
              toast.success(`Auto-pick complete: ${res.accepted} accepted, ${res.rejected} rejected (${res.groups_processed} groups)`, { id: 'auto-pick-toast' })
            } else {
              toast.error('Auto-pick failed', { id: 'auto-pick-toast' })
            }
          } catch {
            toast.error('Auto-pick failed', { id: 'auto-pick-toast' })
          }
          break
        }
        case 'open-delivery-target':
          setShowDeliveryModal(true)
          break
        case 'navigate-survey':
          navigate('/survey')
          break
        case 'open-cull-to-target':
          setShowCullToTarget(true)
          break
        case 'open-vip-modal':
          setShowVipModal(true)
          break
        case 'rescan-folder':
          if (folders.length > 0) {
            toast('Rescanning folder...', { icon: '🔄', id: 'rescan-toast' })
            startScan(folders[0].path, false).catch(() => toast.error('Failed to rescan folder'))
          } else {
            toast('No folder loaded to rescan', { icon: '📁' })
          }
          break
        case 'reset-database':
          if (window.confirm('Are you sure you want to clear the entire photo database? Your original files on disk will NOT be deleted.')) {
            await resetLibrary()
            toast.success('Library reset')
          }
          break
        case 'select-all':
          if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName || '')) {
            (document.activeElement as HTMLInputElement | HTMLTextAreaElement).select?.()
            break
          }
          setSelected(new Set(displayedPhotos.map(p => p.id)))
          toast(`Selected all ${displayedPhotos.length} photos`, { id: 'select-toast' })
          break
        case 'deselect-all':
          setSelected(new Set())
          break
        case 'invert-selection':
          setSelected(prev => new Set(displayedPhotos.filter(p => !prev.has(p.id)).map(p => p.id)))
          break
        case 'rate-accept':
          if (selected.size > 0) {
            for (const id of selected) {
              setPhotoStatusWithUndo(id, 'accepted')
            }
            toast.success(`Accepted ${selected.size} selected photos`)
          } else if (displayedPhotos[focusedIdx]) {
            setPhotoStatusWithUndo(displayedPhotos[focusedIdx].id, 'accepted')
            if (autoAdvance) {
              setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
            }
          }
          break
        case 'rate-reject':
          if (selected.size > 0) {
            for (const id of selected) {
              setPhotoStatusWithUndo(id, 'rejected')
            }
            toast.error(`Rejected ${selected.size} selected photos`)
          } else if (displayedPhotos[focusedIdx]) {
            setPhotoStatusWithUndo(displayedPhotos[focusedIdx].id, 'rejected')
            if (autoAdvance) {
              setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
            }
          }
          break
        case 'rate-pending':
          if (selected.size > 0) {
            for (const id of selected) {
              setPhotoStatusWithUndo(id, 'pending')
            }
          } else if (displayedPhotos[focusedIdx]) {
            setPhotoStatusWithUndo(displayedPhotos[focusedIdx].id, 'pending')
          }
          break
        case 'rate-skip':
          setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          break
        case 'toggle-tag':
          if (selected.size > 0) {
            for (const id of selected) {
              togglePhotoTag(id)
            }
          } else if (displayedPhotos[focusedIdx]) {
            togglePhotoTag(displayedPhotos[focusedIdx].id)
          }
          break
        case 'reanalyze-active': {
          const targetPhoto = displayedPhotos[focusedIdx]
          if (targetPhoto) {
            toast(`Re-analyzing ${targetPhoto.filename}...`, { icon: '🔄', id: 'reanalyze-gallery' })
            api.reanalyzePhoto(targetPhoto.id)
              .then(() => {
                loadPhotos()
                toast.success(`Re-analyzed ${targetPhoto.filename}!`, { id: 'reanalyze-gallery' })
              })
              .catch(() => toast.error('Re-analysis failed', { id: 'reanalyze-gallery' }))
          }
          break
        }
        case 'analyze-all':
          startAnalysis().catch(() => toast.error('Analysis failed to start'))
          break
        case 'toggle-burst-stacking':
          setViewOptions({ collapseBursts: !viewOptions.collapseBursts })
          break
        case 'prev-photo':
          setFocusedIdx(prev => Math.max(0, prev - 1))
          break
        case 'next-photo':
          setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          break
        case 'first-photo':
          setFocusedIdx(0)
          break
        case 'last-photo':
          setFocusedIdx(Math.max(0, displayedPhotos.length - 1))
          break
        case 'zoom-in':
          setViewOptions({ columns: Math.max(2, (viewOptions.columns || 4) - 1) })
          break
        case 'zoom-out':
          setViewOptions({ columns: Math.min(8, (viewOptions.columns || 4) + 1) })
          break
        case 'zoom-fit':
        case 'zoom-100':
          setViewOptions({ columns: 4 })
          break
      }
    }

    window.addEventListener('app:menu-action', handleAppMenuAction)
    return () => window.removeEventListener('app:menu-action', handleAppMenuAction)
  }, [folders, startScan, resetLibrary, displayedPhotos, selected, focusedIdx, setPhotoStatusWithUndo, autoAdvance, togglePhotoTag, startAnalysis, viewOptions.collapseBursts, viewOptions.columns, setViewOptions, loadPhotos, navigate])

  // Sync menu state with Gallery options
  useEffect(() => {
    window.electronAPI?.updateMenuState?.({
      collapseBursts: viewOptions.collapseBursts
    })
  }, [viewOptions.collapseBursts])

  const handleImport = async (clearPrevious = false) => {
    const folderPath = await window.electronAPI?.openFolderDialog()
    if (!folderPath) return
    try {
      await startScan(folderPath, clearPrevious)
    } catch (e: any) {
      toast.error(e.message || 'Failed to import folder')
    }
  }

  const handleSwitchShoot = async () => {
    const confirmed = window.confirm(
      'Switch shoot? This will clear current photos from your workspace and open a new folder (your original files on disk remain untouched).'
    )
    if (!confirmed) return
    handleImport(true)
  }

  const handleCardClick = (photo: Photo, idx: number, e: React.MouseEvent) => {
    // In spray mode clicks paint instead of navigating
    if (sprayMode) return
    setFocusedIdx(idx)
    setActivePhotoId(photo.id)
    if (e.shiftKey && lastClickedIdx !== null) {
      // Range select
      const lo = Math.min(lastClickedIdx, idx)
      const hi = Math.max(lastClickedIdx, idx)
      setSelected(prev => {
        const next = new Set(prev)
        displayedPhotos.slice(lo, hi + 1).forEach(p => next.add(p.id))
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev)
        next.has(photo.id) ? next.delete(photo.id) : next.add(photo.id)
        return next
      })
      setLastClickedIdx(idx)
    } else {
      navigate(`/review/${photo.id}`)
    }
  }

  const handleSelectToggle = (photoId: number, idx: number) => {
    setFocusedIdx(idx)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(photoId) ? next.delete(photoId) : next.add(photoId)
      return next
    })
    setLastClickedIdx(idx)
  }

  const handleBulkStatus = async (status: 'accepted' | 'rejected') => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const updates = ids.map(id => api.updatePhotoStatus(id, status))
    await Promise.all(updates)
    ids.forEach(id => updatePhotoStatusLocal(id, status))
    toast.success(`${ids.length} photo(s) marked as ${status}`)
    setSelected(new Set())
    api.getStats().then(setStats).catch(() => {})
  }

  // ── Spray Can (paint selections via event delegation) ────────────────
  const paintPhoto = useCallback((photoId: number, status: 'accepted' | 'rejected') => {
    if (sprayedIdsRef.current.has(photoId)) return
    sprayedIdsRef.current.add(photoId)
    updatePhotoStatusLocal(photoId, status)
    api.updatePhotoStatus(photoId, status).catch(() => {
      toast.error('Failed to update photo status')
    })
  }, [updatePhotoStatusLocal])

  const photoIdFromEvent = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.('[data-photo-id]')
    const id = el?.getAttribute('data-photo-id')
    return id ? parseInt(id, 10) : null
  }

  const handleSprayMouseDown = (e: React.MouseEvent) => {
    if (!sprayMode) return
    const id = photoIdFromEvent(e)
    if (id == null || Number.isNaN(id)) return
    e.preventDefault()
    // Default paint action toggles based on the first photo touched
    const touched = displayedPhotos.find(p => p.id === id)
    const action: 'accepted' | 'rejected' = touched
      ? (touched.status === 'accepted' ? 'rejected' : 'accepted')
      : sprayActionRef.current
    setSprayAction(action)
    sprayActionRef.current = action
    sprayedIdsRef.current = new Set()
    setIsSpraying(true)
    paintPhoto(id, action)
  }

  const handleSprayMouseMove = (e: React.MouseEvent) => {
    if (!sprayMode || !isSpraying) return
    const id = photoIdFromEvent(e)
    if (id == null || Number.isNaN(id)) return
    paintPhoto(id, sprayActionRef.current)
  }

  // End a spray stroke even if the mouse is released outside the grid
  useEffect(() => {
    if (!isSpraying) return
    const up = () => setIsSpraying(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [isSpraying])

  // Escape closes the Cull to Target modal
  useEffect(() => {
    if (!showCullToTarget) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCullToTarget(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCullToTarget])

  // ── Cull to Target ───────────────────────────────────────────────────
  const handleCullToTarget = async () => {
    const target = Math.min(9999, Math.max(1, cullTarget || 100))
    setCullApplying(true)
    try {
      const res = await api.cullToTarget(target, filters.folder || undefined)
      await loadPhotos()
      api.getStats().then(setStats).catch(() => {})
      toast.success(`✓ Accepted ${res.accepted} photos, rejected ${res.rejected}`)
      setShowCullToTarget(false)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || 'Cull to target failed')
    } finally {
      setCullApplying(false)
    }
  }

  const handleClearAll = () => {
    setFilters({
      search: undefined,
      status: '',
      folder: undefined,
      min_score: undefined,
      is_blurry: undefined,
      is_bokeh: undefined,
      exposure_type: undefined,
      has_faces: undefined,
      has_closed_eyes: undefined,
      is_smiling: undefined,
      is_detail_shot: undefined,
      is_motion_intentional: undefined,
      shoot_genre: undefined,
      duplicate_only: undefined,
      burst_only: undefined,
      is_burst_leader: undefined,
      is_raw: undefined,
      scene_id: undefined,
    })
  }

  const isTrulyEmpty = libraryTotal === 0 && folders.length === 0 && totalPhotos === 0
  if (isTrulyEmpty && !isScanning && !isAnalyzing) {
    return <WelcomeScreen onImport={handleImport} onOpenWalkthrough={() => window.dispatchEvent(new CustomEvent('app:open-walkthrough'))} />
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0 overflow-x-auto [scrollbar-width:none] shrink-0 min-w-0">
        <h1 className="text-white font-semibold text-lg mr-1 shrink-0">Gallery</h1>

        <button
          onClick={() => handleImport(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          title="Import or add another folder of photos to library"
        >
          <FolderPlus size={14} />
          <span className="hidden sm:inline">Add Folder</span>
        </button>

        <button
          onClick={handleSwitchShoot}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          title="Switch to a new shoot (clears workspace and imports a fresh folder)"
        >
          <RotateCcw size={12} className="text-amber-400" />
          <span className="hidden md:inline">Switch Shoot</span>
        </button>

        {/* Global Undo & Redo Buttons */}
        <div className="flex items-center bg-neutral-800 rounded-lg border border-neutral-700 p-0.5 shrink-0">
          <button
            onClick={() => undo()}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Undo last rating (Cmd+Z)"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={() => redo()}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-md hover:bg-neutral-700 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Redo rating (Cmd+Shift+Z)"
          >
            <RotateCw size={12} />
          </button>
        </div>

        {/* Run AI Analysis Button */}
        {totalPhotos > 0 && (
          <button
            onClick={() => startAnalysis()}
            disabled={isAnalyzing}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap",
              isAnalyzing
                ? "bg-purple-900/60 border border-purple-500/40 text-purple-300"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-600/25"
            )}
            title="Run AI quality scoring, sharpness analysis, and face detection on imported photos"
          >
            <Sparkles size={13} className={isAnalyzing ? "animate-spin" : ""} />
            <span className="hidden md:inline">{isAnalyzing ? "Analyzing…" : "Run AI Analysis"}</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => openExport()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Export keepers, XMP sidecars, or clean up rejected photos"
          >
            <FolderUp size={14} className="text-indigo-400" />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowDeliveryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Target delivery quota ('Magic Number') and multi-camera clock sync"
          >
            <Target size={14} className="text-emerald-400" />
            <span className="hidden lg:inline">Target Delivery</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => startReanalysis()}
            disabled={isAnalyzing}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer shrink-0 whitespace-nowrap",
              isAnalyzing
                ? "bg-purple-900/40 border-purple-500/40 text-purple-300"
                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700"
            )}
            title="Re-run AI sharpness, exposure, and face analysis on all photos with calibrated algorithms"
          >
            <RefreshCw size={12} className={clsx("text-purple-400", isAnalyzing && "animate-spin")} />
            <span className="hidden xl:inline">Re-Analyze</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowStatsModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="View library statistics and quality breakdown"
          >
            <BarChart2 size={13} className="text-blue-400" />
            <span className="hidden sm:inline">Stats</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowCullToTarget(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Accept your top N photos by AI score, reject the rest"
          >
            <Crosshair size={13} className="text-amber-400" />
            <span className="hidden sm:inline">Cull to Target</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => navigate('/survey')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Rapid-fire review of the rejected pile — rescue anything the AI got wrong"
          >
            <Eye size={13} className="text-indigo-400" />
            <span className="hidden sm:inline">Survey Mode</span>
          </button>
        )}

        <button
          onClick={() => setSprayMode(prev => !prev)}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 whitespace-nowrap",
            sprayMode
              ? sprayAction === 'accepted'
                ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-600/30"
                : "bg-rose-600/20 text-rose-300 border-rose-500/50 hover:bg-rose-600/30"
              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200"
          )}
          title="Spray mode (S) — click & drag over photos to paint accept/reject"
        >
          <Paintbrush size={13} className={sprayMode ? "" : "text-neutral-500"} />
          <span className="hidden sm:inline">Spray{sprayMode ? ` (${sprayAction === 'accepted' ? 'Accept' : 'Reject'})` : ''}</span>
        </button>

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowVipModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Manage pinned VIP faces"
          >
            <Star size={13} className="text-amber-400" />
            <span className="hidden sm:inline">VIPs</span>
          </button>
        )}

        {/* Auto-Advance Toggle */}
        <button
          onClick={toggleAutoAdvance}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 whitespace-nowrap",
            autoAdvance
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200"
          )}
          title={`Auto-Advance is ${autoAdvance ? 'ON' : 'OFF'} (Caps Lock) — rating automatically moves to next photo`}
        >
          <span>⚡ <span className="hidden lg:inline">Auto-Advance</span></span>
          <span className={clsx("w-1.5 h-1.5 rounded-full", autoAdvance ? "bg-amber-400" : "bg-neutral-600")} />
        </button>

        <ViewOptionsMenu />

        <div className="flex-1" />

        {/* Stats */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-3.5 text-xs">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-1 px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-full border border-neutral-700 transition-colors cursor-pointer whitespace-nowrap"
            title={`AI strictness: ${STRICTNESS_PRESETS[strictnessIdx].label} — click to adjust in Settings`}
          >
            <SlidersHorizontal size={11} className="text-purple-400" />
            <span className="font-medium">{STRICTNESS_PRESETS[strictnessIdx].label}</span>
          </button>
          <span className="text-neutral-400">{displayedPhotos.length.toLocaleString()} {viewOptions.collapseBursts && burstCounts.size > 0 ? 'items' : 'photos'}</span>
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <CheckCircle2 size={13} />{stats.accepted}
          </span>
          <span className="flex items-center gap-1 text-rose-400 font-medium">
            <XCircle size={13} />{stats.rejected}
          </span>
          <span className="flex items-center gap-1 text-neutral-400 font-medium">
            <Clock size={13} />{stats.pending}
          </span>
        </div>

        {/* GPU badge */}
        {gpuAvailable && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-900/40 border border-emerald-700/50 rounded-full shrink-0">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-300 text-[11px] font-mono font-semibold">{gpuType.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar />

      {/* Spray mode indicator bar */}
      {sprayMode && (
        <div className={clsx(
          "flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium flex-shrink-0 border-b",
          sprayAction === 'accepted'
            ? "bg-emerald-950/60 border-emerald-800/50 text-emerald-300"
            : "bg-rose-950/60 border-rose-800/50 text-rose-300"
        )}>
          <span>🎨 Spray Mode — painting <strong>{sprayAction === 'accepted' ? 'Accept' : 'Reject'}</strong> — click &amp; drag over photos</span>
          <span className="text-neutral-500 hidden sm:inline">|</span>
          <button
            onClick={() => setSprayAction('accepted')}
            className={clsx("px-2 py-0.5 rounded border text-[11px] cursor-pointer", sprayAction === 'accepted' ? "bg-emerald-600 text-white border-emerald-500" : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700")}
          >
            Accept (A)
          </button>
          <button
            onClick={() => setSprayAction('rejected')}
            className={clsx("px-2 py-0.5 rounded border text-[11px] cursor-pointer", sprayAction === 'rejected' ? "bg-rose-600 text-white border-rose-500" : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700")}
          >
            Reject (R)
          </button>
          <span className="text-neutral-500 hidden md:inline">S to exit</span>
          <button
            onClick={() => setSprayMode(false)}
            className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 text-[11px] cursor-pointer"
          >
            Exit
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-900/30 border-b border-blue-700/40 flex-shrink-0">
          <span className="text-blue-300 text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={() => handleBulkStatus('accepted')}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-md"
          >
            <CheckCircle2 size={12} /> Accept All
          </button>
          <button
            onClick={() => handleBulkStatus('rejected')}
            className="flex items-center gap-1 px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white text-xs rounded-md"
          >
            <XCircle size={12} /> Reject All
          </button>
          {selected.size >= 2 && selected.size <= 4 && (
            <button
              onClick={() => navigate(`/compare?ids=${Array.from(selected).join(',')}`)}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md font-semibold shadow-md shadow-indigo-600/30 transition-colors"
            >
              <Columns size={12} /> Compare Side-by-Side
            </button>
          )}
          <button
            onClick={() => openExport('selected')}
            className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-md border border-neutral-700 transition-colors"
          >
            <FolderUp size={12} className="text-indigo-400" /> Export Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-neutral-400 hover:text-white text-xs ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Shoot Summary Bar */}
      {displayedPhotos.length > 0 && (
        <ShootSummaryBar photos={displayedPhotos} />
      )}

      {/* Photo grid with virtual scrolling or empty state */}
      {displayedPhotos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-neutral-950">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 mb-4 shadow-xl">
            <Search size={28} className="text-neutral-400" />
          </div>
          <h3 className="text-white font-semibold text-base mb-1.5">No Photos Match Active Filters</h3>
          <p className="text-neutral-400 text-xs max-w-sm mb-6 leading-relaxed">
            None of the photos in this shoot match your current search and filter settings. Reset filters to show all photos.
          </p>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Reset All Filters</span>
          </button>
        </div>
      ) : (
        <div
          ref={parentRef}
          onMouseDown={handleSprayMouseDown}
          onMouseMove={handleSprayMouseMove}
          onMouseUp={() => setIsSpraying(false)}
          style={sprayMode ? { cursor: sprayAction === 'accepted' ? 'crosshair' : 'not-allowed' } : undefined}
          className={clsx(
            "flex-1 overflow-auto p-3",
            sprayMode && sprayAction === 'accepted' && "ring-2 ring-inset ring-emerald-500",
            sprayMode && sprayAction === 'rejected' && "ring-2 ring-inset ring-rose-500",
          )}
        >
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const item = virtualItems[virtualRow.index]
              if (!item) return null

              if (item.type === 'header') {
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '48px',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-neutral-200 border-b border-neutral-800/80 bg-neutral-900/60 rounded-lg"
                  >
                    <Bookmark size={15} className="text-indigo-400 flex-shrink-0" />
                    <span>{item.title}</span>
                    <span className="text-xs font-normal text-neutral-500">({item.count} photos)</span>
                  </div>
                )
              }

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                  className="grid gap-2 pb-2"
                >
                  {item.photos.map((photo, colIdx) => {
                    const globalIdx = item.startIndex + colIdx
                    const burstCount = photo.burst_group_id ? burstCounts.get(photo.burst_group_id) : undefined
                    const isBurstExpanded = photo.burst_group_id ? expandedBursts.has(photo.burst_group_id) : false

                    return (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        isSelected={selected.has(photo.id)}
                        isFocused={globalIdx === focusedIdx}
                        burstCount={burstCount}
                        isBurstExpanded={isBurstExpanded}
                        onToggleBurst={photo.burst_group_id ? () => toggleBurst(photo.burst_group_id!) : undefined}
                        onOpenBurstModal={photo.burst_group_id && burstCounts.get(photo.burst_group_id)! > 1
                          ? () => {
                              const groupPhotos = photos.filter(p => p.burst_group_id === photo.burst_group_id)
                              const groupType = groupPhotos.find(p => p.group_type)?.group_type ?? null
                              setBurstModalGroup({ groupId: photo.burst_group_id!, photos: groupPhotos, groupType })
                            }
                          : undefined
                        }
                        onSelect={() => handleSelectToggle(photo.id, globalIdx)}
                        onClick={(e) => handleCardClick(photo, globalIdx, e)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setFocusedIdx(globalIdx)
                          setContextMenu({ x: e.clientX, y: e.clientY, photo })
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Spacebar Quick Face Loupe Modal */}
      {showQuickLoupe && displayedPhotos[focusedIdx] && (
        <QuickLoupeModal
          photo={displayedPhotos[focusedIdx]}
          onClose={() => setShowQuickLoupe(false)}
          onAccept={() => {
            setPhotoStatusWithUndo(displayedPhotos[focusedIdx].id, 'accepted')
            if (focusedIdx < displayedPhotos.length - 1) {
              setFocusedIdx(i => i + 1)
            }
          }}
          onReject={() => {
            setPhotoStatusWithUndo(displayedPhotos[focusedIdx].id, 'rejected')
            if (focusedIdx < displayedPhotos.length - 1) {
              setFocusedIdx(i => i + 1)
            }
          }}
          onNext={() => {
            if (focusedIdx < displayedPhotos.length - 1) {
              setFocusedIdx(i => i + 1)
            }
          }}
          onPrev={() => {
            if (focusedIdx > 0) {
              setFocusedIdx(i => i - 1)
            }
          }}
          onOpenReview={() => {
            setShowQuickLoupe(false)
            navigate(`/review/${displayedPhotos[focusedIdx].id}`)
          }}
        />
      )}

      {/* Progress modals */}
      {isScanning && (
        <ProgressModal
          title="Scanning Folder…"
          subtitle="Finding and indexing your photos"
          progress={scanProgress}
          total={totalPhotos || 100}
          gpuActive={gpuAvailable}
          gpuType={gpuType}
        />
      )}
      {isAnalyzing && (
        <ProgressModal
          title="Analyzing Photos with AI…"
          subtitle="Checking sharpness, exposure, faces, and more"
          progress={analyzeProgress}
          total={totalPhotos}
          gpuActive={gpuAvailable}
          gpuType={gpuType}
        />
      )}
      {/* Target delivery modal */}
      {showDeliveryModal && (
        <TargetDeliveryModal
          onClose={() => setShowDeliveryModal(false)}
        />
      )}

      {/* Cull to Target modal */}
      {showCullToTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCullToTarget(false)
          }}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                <Crosshair size={17} className="text-amber-400" />
                Cull to Target
              </h2>
              <button
                onClick={() => setShowCullToTarget(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <label className="block text-sm text-neutral-300 mb-2">
              Accept my top{' '}
              <input
                type="number"
                min={1}
                max={9999}
                value={cullTarget}
                onChange={(e) => setCullTarget(Math.min(9999, Math.max(1, parseInt(e.target.value) || 0)))}
                className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 mx-1"
              />{' '}
              photos
            </label>
            <p className="text-xs text-neutral-400 leading-relaxed mb-5">
              All analyzed photos will be ranked by AI score. The top N are accepted, the rest rejected.
              {filters.folder ? ` Limited to folder: ${filters.folder}` : ''}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCullToTarget(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCullToTarget}
                disabled={cullApplying}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {cullApplying ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Burst Group Modal */}
      {burstModalGroup && (
        <BurstGroupModal
          burstGroupId={burstModalGroup.groupId}
          burstPhotos={burstModalGroup.photos}
          groupType={burstModalGroup.groupType}
          onClose={() => setBurstModalGroup(null)}
          onStatusChange={(photoId, status) => {
            setPhotoStatusWithUndo(photoId, status)
          }}
        />
      )}

      {/* Stats Modal */}
      {showStatsModal && (
        <StatsModal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} />
      )}

      {/* VIP Faces Modal */}
      {showVipModal && (
        <VipFacesModal isOpen={showVipModal} onClose={() => setShowVipModal(false)} />
      )}

      {/* Pro right-click menu for gallery thumbnails */}
      {contextMenu && (
        <PhotoContextMenu
          photo={contextMenu.photo}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
