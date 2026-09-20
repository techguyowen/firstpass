import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  FolderPlus, RotateCcw, RotateCw, CheckCircle2, XCircle, Clock,
  RefreshCw, Columns, FolderUp, Bookmark, Target, Sparkles, Search, Layers, BarChart2, Star
} from 'lucide-react'
import { usePhotosStore } from '../store/photosStore'
import { api } from '../api/client'
import type { Photo } from '../types/photo'
import PhotoCard from '../components/PhotoCard'
import FilterBar from '../components/FilterBar'
import ProgressModal from '../components/ProgressModal'
import WelcomeScreen from '../components/WelcomeScreen'
import ExportModal from '../components/ExportModal'
import TargetDeliveryModal from '../components/TargetDeliveryModal'
import ViewOptionsMenu from '../components/ViewOptionsMenu'
import QuickLoupeModal from '../components/QuickLoupeModal'
import StatsModal from '../components/StatsModal'
import VipFacesModal from '../components/VipFacesModal'
import BurstGroupModal from '../components/BurstGroupModal'
import ShootSummaryBar from '../components/ShootSummaryBar'

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
  const [showExportModal, setShowExportModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [showQuickLoupe, setShowQuickLoupe] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showVipModal, setShowVipModal] = useState(false)
  const [burstModalGroup, setBurstModalGroup] = useState<{ groupId: string; photos: Photo[] } | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number>(0)
  const [expandedBursts, setExpandedBursts] = useState<Set<string>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)

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

  // Global Keyboard Triage & Undo/Redo Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return
      }

      // Cmd+Z / Ctrl+Z (Undo / Redo)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
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
      if (showQuickLoupe || showExportModal || showDeliveryModal) return
      if (displayedPhotos.length === 0) return

      const curPhoto = displayedPhotos[focusedIdx]

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
          break
        case 'ArrowLeft':
          e.preventDefault()
          setFocusedIdx(prev => Math.max(0, prev - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + columnCount))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIdx(prev => Math.max(0, prev - columnCount))
          break
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
        case '\\':
        case 't':
        case 'T':
          e.preventDefault()
          if (curPhoto) {
            togglePhotoTag(curPhoto.id)
            if (autoAdvance) {
              setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
            }
          }
          break
        case '`':
        case '~':
        case '1':
        case 'p':
        case 'P':
        case 'a':
        case 'A':
          e.preventDefault()
          if (curPhoto) {
            setPhotoStatusWithUndo(curPhoto.id, 'accepted')
            if (autoAdvance) {
              setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
            }
          }
          break
        case '2':
        case 'x':
        case 'X':
        case 'r':
        case 'R':
          e.preventDefault()
          if (curPhoto) {
            setPhotoStatusWithUndo(curPhoto.id, 'rejected')
            if (autoAdvance) {
              setFocusedIdx(prev => Math.min(displayedPhotos.length - 1, prev + 1))
            }
          }
          break
        case '0':
        case 'u':
        case 'U':
          e.preventDefault()
          if (curPhoto) {
            setPhotoStatusWithUndo(curPhoto.id, 'pending')
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
    showExportModal,
    showDeliveryModal,
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
          setShowExportModal(true)
          break
        case 'open-delivery-target':
          setShowDeliveryModal(true)
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
        case 'toggle-tag':
          if (selected.size > 0) {
            for (const id of selected) {
              togglePhotoTag(id)
            }
          } else if (displayedPhotos[focusedIdx]) {
            togglePhotoTag(displayedPhotos[focusedIdx].id)
          }
          break
        case 'analyze-all':
          startAnalysis().catch(() => toast.error('Analysis failed to start'))
          break
        case 'toggle-burst-stacking':
          setViewOptions({ collapseBursts: !viewOptions.collapseBursts })
          break
      }
    }

    window.addEventListener('app:menu-action', handleAppMenuAction)
    return () => window.removeEventListener('app:menu-action', handleAppMenuAction)
  }, [folders, startScan, resetLibrary, displayedPhotos, selected, focusedIdx, setPhotoStatusWithUndo, autoAdvance, togglePhotoTag, startAnalysis, viewOptions.collapseBursts, setViewOptions])

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
    return <WelcomeScreen onImport={handleImport} />
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <h1 className="text-white font-semibold text-lg mr-1">Gallery</h1>

        <button
          onClick={() => handleImport(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          title="Import or add another folder of photos to library"
        >
          <FolderPlus size={14} />
          <span>Add Folder</span>
        </button>

        <button
          onClick={handleSwitchShoot}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
          title="Switch to a new shoot (clears workspace and imports a fresh folder)"
        >
          <RotateCcw size={12} className="text-amber-400" />
          <span>Switch Shoot</span>
        </button>

        {/* Global Undo & Redo Buttons */}
        <div className="flex items-center bg-neutral-800 rounded-lg border border-neutral-700 p-0.5">
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
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all cursor-pointer",
              isAnalyzing
                ? "bg-purple-900/60 border border-purple-500/40 text-purple-300"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-600/25"
            )}
            title="Run AI quality scoring, sharpness analysis, and face detection on imported photos"
          >
            <Sparkles size={13} className={isAnalyzing ? "animate-spin" : ""} />
            <span>{isAnalyzing ? "Analyzing…" : "Run AI Analysis"}</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="Export keepers, XMP sidecars, or clean up rejected photos"
          >
            <FolderUp size={14} className="text-indigo-400" />
            <span>Export</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowDeliveryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="Target delivery quota ('Magic Number') and multi-camera clock sync"
          >
            <Target size={14} className="text-emerald-400" />
            <span>Target Delivery</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => startReanalysis()}
            disabled={isAnalyzing}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
              isAnalyzing
                ? "bg-purple-900/40 border-purple-500/40 text-purple-300"
                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700"
            )}
            title="Re-run AI sharpness, exposure, and face analysis on all photos with calibrated algorithms"
          >
            <RefreshCw size={12} className={clsx("text-purple-400", isAnalyzing && "animate-spin")} />
            <span>Re-Analyze</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowStatsModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="View library statistics and quality breakdown"
          >
            <BarChart2 size={13} className="text-blue-400" />
            <span>Stats</span>
          </button>
        )}

        {totalPhotos > 0 && (
          <button
            onClick={() => setShowVipModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="Manage pinned VIP faces"
          >
            <Star size={13} className="text-amber-400" />
            <span>VIPs</span>
          </button>
        )}

        {/* Auto-Advance Toggle */}
        <button
          onClick={toggleAutoAdvance}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer",
            autoAdvance
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200"
          )}
          title={`Auto-Advance is ${autoAdvance ? 'ON' : 'OFF'} (Caps Lock) — rating automatically moves to next photo`}
        >
          <span>⚡ Auto-Advance</span>
          <span className={clsx("w-1.5 h-1.5 rounded-full", autoAdvance ? "bg-amber-400" : "bg-neutral-600")} />
        </button>

        <ViewOptionsMenu />

        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3.5 text-xs">
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
          <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-900/40 border border-emerald-700/50 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-300 text-[11px] font-mono font-semibold">{gpuType.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar />

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
            onClick={() => setShowExportModal(true)}
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
        <div ref={parentRef} className="flex-1 overflow-auto p-3">
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
                              setBurstModalGroup({ groupId: photo.burst_group_id!, photos: groupPhotos })
                            }
                          : undefined
                        }
                        onSelect={() => handleSelectToggle(photo.id, globalIdx)}
                        onClick={(e) => handleCardClick(photo, globalIdx, e)}
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
      {/* Export modal */}
      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          selectedIds={Array.from(selected)}
        />
      )}
      {/* Target delivery modal */}
      {showDeliveryModal && (
        <TargetDeliveryModal
          onClose={() => setShowDeliveryModal(false)}
        />
      )}

      {/* Burst Group Modal */}
      {burstModalGroup && (
        <BurstGroupModal
          burstGroupId={burstModalGroup.groupId}
          burstPhotos={burstModalGroup.photos}
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
    </div>
  )
}
