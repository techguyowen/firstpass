import React, { useState, useEffect } from 'react'
import type { Photo } from '../types/photo'
import { usePhotosStore } from '../store/photosStore'
import { api } from '../api/client'
import {
  Users, EyeOff, FileImage, Calendar, HardDrive, Layers, Camera, Crown,
  AlertTriangle, Sparkles, Smile, Bookmark, Check, X, Clock,
  PanelLeft, PanelRight, ExternalLink, Sliders, Settings2, RotateCcw,
  SlidersHorizontal, CheckSquare, Square, Info, Activity, ChevronsRight, ChevronsLeft,
  ChevronDown, ChevronRight, MoreHorizontal, GripVertical, Split, Anchor, LayoutList,
  Columns
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import InspectorBox from './InspectorBox'
import FaceLoupe from './FaceLoupe'
import { HistogramChart } from './HistogramWidget'
import CullingActionBar, { TriagePlacement } from './CullingActionBar'
import { dockDragManager, DragState, DropTarget } from '../utils/dockDragManager'

export type DockMode = 'right' | 'left' | 'floating' | 'collapsed'
export type PanelDockPlacement = 'sidebar' | 'bottom' | 'floating' | 'hidden'

export interface DockGroup {
  id: string
  tabs: string[]
  activeTab: string
  isCollapsed?: boolean
}

export const DEFAULT_DOCK_GROUPS: DockGroup[] = [
  {
    id: 'group-culling',
    tabs: ['culling', 'overall'],
    activeTab: 'culling',
  },
  {
    id: 'group-quality',
    tabs: ['quality', 'people', 'reasons'],
    activeTab: 'quality',
  },
  {
    id: 'group-details',
    tabs: ['camera', 'file', 'histogram', 'context'],
    activeTab: 'camera',
  },
]

export interface ScorePanelProps {
  photo: Photo
  dockMode?: DockMode
  onSetDockMode?: (mode: DockMode) => void
  isFloating?: boolean
  onSelectFace?: (box: [number, number, number, number]) => void
  onResetZoom?: () => void
  zoomLevel?: number
  faceLoupeMode?: 'sidebar' | 'bottom' | 'floating' | 'hidden'
  onSetFaceLoupeMode?: (mode: 'sidebar' | 'bottom' | 'floating' | 'hidden') => void
  histogramMode?: 'sidebar' | 'bottom' | 'floating' | 'hidden'
  onSetHistogramMode?: (mode: 'sidebar' | 'bottom' | 'floating' | 'hidden') => void
  modulePlacements?: Record<string, PanelDockPlacement>
  onSetModulePlacement?: (id: string, placement: PanelDockPlacement, floatPos?: { x: number; y: number }) => void
  triagePlacement?: TriagePlacement
  onSetTriagePlacement?: (placement: TriagePlacement) => void
  onStatus?: (status: 'accepted' | 'rejected' | 'pending') => void
  onToggleTag?: () => void
}

export const DEFAULT_MODULE_PLACEMENTS: Record<string, PanelDockPlacement> = {
  culling: 'sidebar',
  histogram: 'sidebar',
  overall: 'sidebar',
  reasons: 'sidebar',
  quality: 'sidebar',
  people: 'bottom',
  context: 'sidebar',
  camera: 'sidebar',
  file: 'sidebar',
}

export const DEFAULT_MODULE_ORDER = [
  'culling',
  'histogram',
  'overall',
  'reasons',
  'quality',
  'people',
  'context',
  'camera',
  'file',
]

export const MODULE_TITLES: Record<string, string> = {
  culling: 'Culling Actions',
  histogram: 'Histogram',
  overall: 'Overall Score',
  reasons: 'Decision Insights',
  quality: 'Quality Metrics',
  people: 'People & Faces',
  context: 'Shooting Context',
  camera: 'Camera EXIF',
  file: 'File Info',
}

export const MODULE_ICONS: Record<string, React.ReactNode> = {
  culling: <CheckSquare size={13} className="text-emerald-400" />,
  histogram: <Activity size={13} className="text-purple-400" />,
  overall: <Sparkles size={13} className="text-amber-400" />,
  reasons: <Sparkles size={13} className="text-indigo-400" />,
  quality: <Sliders size={13} className="text-emerald-400" />,
  people: <Users size={13} className="text-blue-400" />,
  context: <Layers size={13} className="text-purple-400" />,
  camera: <Camera size={13} className="text-sky-400" />,
  file: <FileImage size={13} className="text-neutral-400" />,
}

export function ScoreBar({ label, score, color }: { label: string; score: number | null; color: string }) {
  if (score === null) return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-neutral-500 mb-1">
        <span>{label}</span><span>Analyzing…</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-neutral-700 rounded-full animate-pulse" />
      </div>
    </div>
  )

  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono text-neutral-300 font-medium">{Math.round(score)}</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function scoreColor(score: number | null) {
  if (score === null) return 'text-neutral-500'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-rose-400'
}

export function barColor(score: number | null) {
  if (score === null) return 'bg-neutral-600'
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function checkCameraShake(shutter?: string | null, focal?: string | null): boolean {
  if (!shutter || !focal) return false
  try {
    if (shutter.startsWith('1/')) {
      const denominator = parseFloat(shutter.replace('1/', '').replace('s', ''))
      const focalMm = parseFloat(focal.replace('mm', ''))
      if (denominator > 0 && focalMm > 0) {
        return denominator < focalMm * 0.8
      }
    }
  } catch {}
  return false
}

export function SplitLineDropZone({
  index,
  isDragActive,
  isTarget,
}: {
  index: number
  isDragActive: boolean
  isTarget: boolean
}) {
  return (
    <div
      data-split-index={index}
      className={clsx(
        "relative transition-all duration-150 select-none flex items-center justify-center",
        isTarget
          ? "h-7 my-1 rounded-lg bg-blue-500/30 border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.8)] z-30 animate-pulse"
          : isDragActive
          ? "h-4 my-0.5 rounded border border-dashed border-blue-500/50 bg-blue-500/10 hover:border-blue-400 hover:bg-blue-500/20 z-20 cursor-pointer"
          : "h-1.5 my-0.5"
      )}
    >
      {(isTarget || isDragActive) && (
        <span
          className={clsx(
            "text-[10px] font-semibold tracking-wider uppercase pointer-events-none transition-colors",
            isTarget ? "text-blue-100 font-bold" : "text-blue-400/80"
          )}
        >
          {isTarget ? "── Release to Split into New Group ──" : "── Split Here ──"}
        </span>
      )}
    </div>
  )
}

function getScoreStorage(key: string): string | null {
  try {
    return localStorage.getItem(`firstpass_${key}`) ?? localStorage.getItem(`photo_culler_${key}`)
  } catch {
    return null
  }
}

function setScoreStorage(key: string, value: string): void {
  try {
    localStorage.setItem(`firstpass_${key}`, value)
    localStorage.setItem(`photo_culler_${key}`, value)
  } catch {}
}

function removeScoreStorage(key: string): void {
  try {
    localStorage.removeItem(`firstpass_${key}`)
    localStorage.removeItem(`photo_culler_${key}`)
  } catch {}
}

export default function ScorePanel({
  photo,
  dockMode = 'right',
  onSetDockMode,
  isFloating = false,
  onSelectFace,
  onResetZoom,
  zoomLevel = 1,
  faceLoupeMode = 'sidebar',
  onSetFaceLoupeMode,
  histogramMode = 'sidebar',
  onSetHistogramMode,
  modulePlacements,
  onSetModulePlacement,
  triagePlacement,
  onSetTriagePlacement,
  onStatus,
  onToggleTag,
}: ScorePanelProps) {
  const { startAnalysis, isAnalyzing, setPhotoStatusWithHistory, togglePhotoTag } = usePhotosStore()
  const isShakeRisk = checkCameraShake(photo.shutter_speed, photo.focal_length)

  const getPlacement = (id: string): PanelDockPlacement => {
    if (id === 'histogram') return histogramMode || 'sidebar'
    if (id === 'people') return faceLoupeMode || 'bottom'
    if (id === 'culling') return triagePlacement === 'sidebar' ? 'sidebar' : (triagePlacement === 'bottom' ? 'bottom' : (triagePlacement === 'floating' ? 'floating' : 'sidebar'))
    return modulePlacements?.[id] || 'sidebar'
  }

  const handleSetPlacement = (id: string, placement: PanelDockPlacement, floatPos?: { x: number; y: number }) => {
    if (id === 'histogram' && onSetHistogramMode) {
      onSetHistogramMode(placement)
    }
    if (id === 'people' && onSetFaceLoupeMode) {
      onSetFaceLoupeMode(placement)
    }
    if (id === 'culling' && onSetTriagePlacement) {
      onSetTriagePlacement(placement === 'sidebar' ? 'sidebar' : placement === 'bottom' ? 'bottom' : placement === 'floating' ? 'floating' : 'sidebar')
    }
    if (onSetModulePlacement) {
      onSetModulePlacement(id, placement, floatPos)
    }
  }

  // Module order state
  const [modulesOrder, setModulesOrder] = useState<string[]>(() => {
    try {
      const saved = getScoreStorage('inspector_order')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with any newly introduced modules
          const merged = parsed.filter(id => DEFAULT_MODULE_ORDER.includes(id))
          DEFAULT_MODULE_ORDER.forEach(id => {
            if (!merged.includes(id)) merged.push(id)
          })
          return merged
        }
      }
    } catch {}
    return DEFAULT_MODULE_ORDER
  })

  // Collapsed modules state
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = getScoreStorage('inspector_collapsed')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {}
  })

  // Visibility state
  const [visibleModules, setVisibleModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = getScoreStorage('inspector_visible')
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_MODULE_ORDER.reduce((acc, id) => ({ ...acc, [id]: true }), {})
  })

  // Customize drawer open state
  const [showCustomizeDrawer, setShowCustomizeDrawer] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [headerContextMenu, setHeaderContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Panel layout mode: 'tabbed' (Studio tab groups) vs 'accordion' (classic stacked cards)
  const [panelLayout, setPanelLayout] = useState<'tabbed' | 'accordion'>(() => {
    try {
      const saved = getScoreStorage('panel_layout')
      if (saved === 'accordion' || saved === 'tabbed') return saved
    } catch {}
    return 'tabbed'
  })

  // Studio Dock Groups
  const [dockGroups, setDockGroups] = useState<DockGroup[]>(() => {
    try {
      const saved = getScoreStorage('dock_groups')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return DEFAULT_DOCK_GROUPS
  })

  const saveDockGroups = (groups: DockGroup[]) => {
    setDockGroups(groups)
    setScoreStorage('dock_groups', JSON.stringify(groups))
  }

  // Subscribe to universal 60fps dock drag manager
  const [dragState, setDragState] = useState<DragState>(dockDragManager.getState())
  useEffect(() => {
    return dockDragManager.subscribe(setDragState)
  }, [])

  // Context menus for group header and tabs
  const [groupMenuState, setGroupMenuState] = useState<{
    x: number
    y: number
    group: DockGroup
  } | null>(null)

  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number
    y: number
    tabId: string
    groupId: string
  } | null>(null)

  const handleTabPointerDown = (e: React.PointerEvent, tabId: string, sourceGroupId: string) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let hasStartedDrag = false

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!hasStartedDrag && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        hasStartedDrag = true
        dockDragManager.startDrag(
          {
            type: 'module-tab',
            id: tabId,
            title: MODULE_TITLES[tabId] || tabId,
            sourceGroup: sourceGroupId,
            sourceZone: 'sidebar',
          },
          ev.clientX,
          ev.clientY
        )
      }

      if (hasStartedDrag) {
        dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey)
      }
    }

    const handlePointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)

      if (hasStartedDrag) {
        const drop = dockDragManager.endDrag()
        if (drop && drop.dropTarget) {
          handleExecuteDrop(tabId, sourceGroupId, drop.dropTarget)
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleExecuteDrop = (tabId: string, sourceGroupId: string, target: DropTarget) => {
    const actualTabId = tabId === 'sorting-bar' ? 'culling' : tabId

    if (target.type === 'sidebar-dock') {
      let next = [...dockGroups]
      if (!next.some((g) => g.tabs.includes(actualTabId))) {
        if (next.length > 0) {
          next[0] = { ...next[0], tabs: [actualTabId, ...next[0].tabs], activeTab: actualTabId }
        } else {
          next = [{ id: `group-${actualTabId}-${Date.now()}`, tabs: [actualTabId], activeTab: actualTabId }]
        }
        saveDockGroups(next)
      }
      handleSetPlacement(actualTabId, 'sidebar')
      toast.success(`Docked ${MODULE_TITLES[actualTabId] || actualTabId} into Sidebar`)
      return
    }

    if (target.type === 'split-line') {
      const newGroup: DockGroup = {
        id: `group-${actualTabId}-${Date.now()}`,
        tabs: [actualTabId],
        activeTab: actualTabId,
        isCollapsed: false,
      }
      let next = dockGroups.map((g) => {
        if (g.id === sourceGroupId) {
          const remainingTabs = g.tabs.filter((t) => t !== actualTabId)
          return {
            ...g,
            tabs: remainingTabs,
            activeTab: g.activeTab === actualTabId ? remainingTabs[0] || '' : g.activeTab,
          }
        }
        return g
      }).filter((g) => g.tabs.length > 0)

      const insertIdx = Math.min(next.length, Math.max(0, target.groupIndex))
      next.splice(insertIdx, 0, newGroup)
      saveDockGroups(next)
      handleSetPlacement(actualTabId, 'sidebar')
      toast.success(`Split ${MODULE_TITLES[actualTabId] || actualTabId} into new group`)
    } else if (target.type === 'tab-group') {
      if (target.groupId !== sourceGroupId) {
        let next = dockGroups.map((g) => {
          if (g.id === sourceGroupId) {
            const remainingTabs = g.tabs.filter((t) => t !== actualTabId)
            return {
              ...g,
              tabs: remainingTabs,
              activeTab: g.activeTab === actualTabId ? remainingTabs[0] || '' : g.activeTab,
            }
          }
          if (g.id === target.groupId) {
            const newTabs = g.tabs.includes(actualTabId) ? g.tabs : [...g.tabs, actualTabId]
            return {
              ...g,
              tabs: newTabs,
              activeTab: actualTabId,
            }
          }
          return g
        }).filter((g) => g.tabs.length > 0)

        saveDockGroups(next)
        handleSetPlacement(actualTabId, 'sidebar')
        toast.success(`Added ${MODULE_TITLES[actualTabId] || actualTabId} as tab`)
      }
    } else if (target.type === 'bottom-dock' || target.type === 'bottom-tab-group' || target.type === 'bottom-split') {
      handleSetPlacement(actualTabId, 'bottom')
      toast.success(`Docked ${MODULE_TITLES[actualTabId] || actualTabId} to Bottom Bar`)
    } else if (target.type === 'side-dock') {
      handleSetPlacement(actualTabId, 'sidebar')
    } else if (target.type === 'canvas') {
      handleSetPlacement(actualTabId, 'floating', {
        x: Math.max(40, target.x - 120),
        y: Math.max(60, target.y - 40),
      })
      toast.success(`Detached ${MODULE_TITLES[actualTabId] || actualTabId} into floating window`)
    }
  }

  const handleSelectTab = (groupId: string, tabId: string) => {
    const next = dockGroups.map((g) =>
      g.id === groupId ? { ...g, activeTab: tabId } : g
    )
    saveDockGroups(next)
  }

  const handleToggleGroupCollapse = (groupId: string) => {
    const next = dockGroups.map((g) =>
      g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g
    )
    saveDockGroups(next)
  }

  const handleSplitGroupIntoPanels = (groupId: string) => {
    const group = dockGroups.find((g) => g.id === groupId)
    if (!group || group.tabs.length <= 1) return
    const groupIdx = dockGroups.findIndex((g) => g.id === groupId)
    const newGroups: DockGroup[] = group.tabs.map((t) => ({
      id: `group-${t}-${Date.now()}`,
      tabs: [t],
      activeTab: t,
      isCollapsed: false,
    }))
    const copy = [...dockGroups]
    copy.splice(groupIdx, 1, ...newGroups)
    saveDockGroups(copy)
    toast.success(`Split group into separate panels`)
  }

  const handleResetToDefaultGroups = () => {
    saveDockGroups(DEFAULT_DOCK_GROUPS)
    toast.success('Reset to default studio tab groups')
  }

  const handleSplitAllIntoPanels = () => {
    const allTabs = Array.from(new Set(dockGroups.flatMap((g) => g.tabs)))
    const newGroups: DockGroup[] = allTabs.map((t) => ({
      id: `group-${t}-${Date.now()}`,
      tabs: [t],
      activeTab: t,
      isCollapsed: false,
    }))
    saveDockGroups(newGroups)
    toast.success('Split all panels into individual groups')
  }

  let reasons: { summary?: string; positives?: string[]; rejections?: string[] } | null = null
  if (photo.reasons_json) {
    try {
      reasons = JSON.parse(photo.reasons_json)
    } catch {}
  }

  const isStageLighting = Boolean(
    photo.lighting_type &&
    photo.lighting_type !== 'standard' &&
    photo.lighting_type !== 'normal'
  )

  const isVip = Boolean(
    photo.face_count &&
    photo.face_count > 0 &&
    photo.is_vip_focused
  )

  // Handlers for reordering and collapsing
  const handleToggleCollapse = (id: string) => {
    setCollapsedModules(prev => {
      const next = { ...prev, [id]: !prev[id] }
      setScoreStorage('inspector_collapsed', JSON.stringify(next))
      return next
    })
  }

  const handleToggleVisibility = (id: string) => {
    setVisibleModules(prev => {
      const next = { ...prev, [id]: !prev[id] }
      setScoreStorage('inspector_visible', JSON.stringify(next))
      return next
    })
  }

  const handleMoveUp = (id: string) => {
    setModulesOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx <= 0) return prev
      const copy = [...prev]
      const temp = copy[idx - 1]
      copy[idx - 1] = copy[idx]
      copy[idx] = temp
      setScoreStorage('inspector_order', JSON.stringify(copy))
      return copy
    })
  }

  const handleMoveDown = (id: string) => {
    setModulesOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const copy = [...prev]
      const temp = copy[idx + 1]
      copy[idx + 1] = copy[idx]
      copy[idx] = temp
      setScoreStorage('inspector_order', JSON.stringify(copy))
      return copy
    })
  }

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    setModulesOrder(prev => {
      const fromIdx = prev.indexOf(draggedId)
      const toIdx = prev.indexOf(targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const copy = [...prev]
      const [moved] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, moved)
      setScoreStorage('inspector_order', JSON.stringify(copy))
      return copy
    })
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleResetLayout = () => {
    setModulesOrder(DEFAULT_MODULE_ORDER)
    setCollapsedModules({})
    const allVis = DEFAULT_MODULE_ORDER.reduce((acc, id) => ({ ...acc, [id]: true }), {})
    setVisibleModules(allVis)
    try {
      removeScoreStorage('inspector_order')
      removeScoreStorage('inspector_collapsed')
      removeScoreStorage('inspector_visible')
    } catch {}
    toast.success('Inspector boxes reset to default layout')
    setShowCustomizeDrawer(false)
  }

  // Box 0: Histogram (RGB & Luma)
  const renderHistogramBox = () => {
    if (histogramMode !== 'sidebar') {
      return (
        <div className="flex flex-col items-center justify-center p-3 text-center bg-neutral-950/40 rounded-lg border border-neutral-800/60">
          <Activity size={20} className="text-purple-400/60 mb-1.5" />
          <p className="text-xs text-neutral-400 mb-2">
            {histogramMode === 'floating' ? 'Histogram is currently floating' : 'Histogram is hidden'}
          </p>
          {onSetHistogramMode && (
            <button
              onClick={() => onSetHistogramMode('sidebar')}
              className="px-2 py-1 text-[11px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded transition-colors cursor-pointer"
            >
              Dock Histogram Here
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-1.5">
        <HistogramChart
          imageUrl={api.getFullImageUrl(photo.id)}
          compact={true}
          headerRight={
            onSetHistogramMode ? (
              <button
                onClick={() => onSetHistogramMode('floating')}
                className="text-[10px] text-neutral-400 hover:text-white px-1 py-0.5 rounded hover:bg-neutral-800 flex items-center gap-1 transition-colors cursor-pointer"
                title="Float Histogram as Movable Window"
              >
                <ExternalLink size={10} />
                <span>Float</span>
              </button>
            ) : undefined
          }
        />
      </div>
    )
  }

  // Box 1: Overall Score & Quick Triage
  const renderOverallBox = () => (
    <div className="flex flex-col items-center pt-1 pb-1">
      <div className={`text-4xl font-bold mb-0.5 tracking-tight ${scoreColor(photo.overall_score)}`}>
        {photo.overall_score !== null && photo.is_analyzed ? Math.round(photo.overall_score) : '—'}
      </div>
      <div className="text-neutral-500 text-[11px] mb-2 font-medium">
        {photo.is_analyzed ? 'Calculated Overall Score' : 'Analysis Pending'}
      </div>

      <div className={clsx(
        'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
        photo.status === 'accepted' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/80 shadow-sm' :
        photo.status === 'rejected' ? 'bg-rose-900/50 text-rose-300 border border-rose-700/80 shadow-sm' :
        'bg-neutral-800 text-neutral-400 border border-neutral-700'
      )}>
        {photo.status}
      </div>

      {!photo.is_analyzed && (
        <div className="mt-3 w-full p-2.5 rounded-lg border border-amber-900/60 bg-amber-950/20 text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
            <AlertTriangle size={13} className="text-amber-400" />
            <span>AI Analysis Pending</span>
          </div>
          <p className="text-[11px] text-neutral-400 mb-2 leading-relaxed">
            Run AI analysis to compute sharpness, aesthetic quality, and expression detection.
          </p>
          <button
            onClick={() => startAnalysis([photo.id])}
            disabled={isAnalyzing}
            className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow"
          >
            <Sparkles size={12} className={isAnalyzing ? 'animate-spin' : ''} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze This Photo'}</span>
          </button>
        </div>
      )}
    </div>
  )

  // Box 2: Explainable AI Decision Breakdown
  const renderReasonsBox = () => {
    if (!reasons) {
      return (
        <div className="text-neutral-500 text-xs italic text-center py-2">
          {photo.is_analyzed ? 'No specific rule triggers detected.' : 'Insights available after AI analysis.'}
        </div>
      )
    }
    return (
      <div>
        {reasons.summary && (
          <p className="text-xs text-neutral-200 leading-relaxed mb-2.5 font-medium">
            {reasons.summary}
          </p>
        )}
        {reasons.positives && reasons.positives.length > 0 && (
          <div className="space-y-1 mb-2">
            {reasons.positives.map((pos, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-2 py-1">
                <Check size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{pos}</span>
              </div>
            ))}
          </div>
        )}
        {reasons.rejections && reasons.rejections.length > 0 && (
          <div className="space-y-1">
            {reasons.rejections.map((rej, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg px-2 py-1">
                <X size={12} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{rej}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Box 3: Quality Metrics
  const renderQualityBox = () => (
    <div>
      <ScoreBar label="🎯 Sharpness" score={photo.blur_score} color={barColor(photo.blur_score)} />
      {photo.is_blurry && !photo.is_bokeh && (
        <p className="text-rose-400 text-[11px] mb-2 -mt-1 pl-1 font-medium">⚠ Soft or blurry focus detected</p>
      )}
      <ScoreBar label="💡 Exposure" score={photo.exposure_score} color={barColor(photo.exposure_score)} />
      {photo.exposure_type && photo.exposure_type !== 'good' && (
        <p className="text-amber-400 text-[11px] mb-2 -mt-1 pl-1 font-medium">
          {photo.exposure_type === 'underexposed' ? '🌑 Shadows crushed (underexposed)' : '☀️ Highlights blown (overexposed)'}
        </p>
      )}
      <ScoreBar label="✨ Aesthetic" score={photo.aesthetic_score} color={barColor(photo.aesthetic_score)} />
      <ScoreBar label="📐 Composition" score={photo.composition_score} color={barColor(photo.composition_score)} />
    </div>
  )

  // Box 4: People & Expressions
  const renderPeopleBox = () => (
    <div>
      <div className="flex items-center gap-2 text-neutral-300 text-xs mb-1.5">
        <Users size={14} className="text-indigo-400" />
        <span>{photo.face_count === null ? 'Analysis pending' : photo.face_count === 0 ? 'No faces detected' : `${photo.face_count} subject face${photo.face_count > 1 ? 's' : ''}`}</span>
      </div>

      {photo.has_closed_eyes && (
        <div className="flex items-center gap-1.5 text-purple-400 text-xs mt-1.5 bg-purple-950/30 border border-purple-800/30 px-2 py-1 rounded-md">
          <EyeOff size={13} />
          <span>Closed or blinking eyes detected</span>
        </div>
      )}

      {photo.smile_score !== undefined && photo.smile_score !== null && photo.smile_score > 25 && (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs mt-1.5 bg-amber-950/30 border border-amber-800/30 px-2 py-1 rounded-md">
          <Smile size={13} />
          <span>Flattering smile ({Math.round(photo.smile_score)}%)</span>
        </div>
      )}

      {photo.face_count && photo.face_count >= 2 && photo.group_consistency_score !== null && photo.group_consistency_score !== undefined && (
        <div className="mt-2.5 pt-2 border-t border-neutral-800/80">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-neutral-400">Group Consistency</span>
            <span className="font-mono text-neutral-300 font-medium">{Math.round(photo.group_consistency_score)}%</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                photo.group_consistency_score >= 80 ? 'bg-emerald-500' :
                photo.group_consistency_score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, photo.group_consistency_score))}%` }}
            />
          </div>
          <span className="text-[10px] text-neutral-500 mt-1 block">
            {photo.group_consistency_score >= 80 ? 'All subjects have open eyes & clean expressions' : 'Mixed blinks or awkward timing in group'}
          </span>
        </div>
      )}

      {/* Embedded 100% Face Loupe Inspection */}
      {photo.face_count && photo.face_count > 0 && faceLoupeMode === 'sidebar' && (
        <FaceLoupe
          photoId={photo.id}
          onSelectFace={onSelectFace}
          onResetZoom={onResetZoom}
          zoomLevel={zoomLevel}
          layout="sidebar"
          onToggleFloating={() => onSetFaceLoupeMode?.('floating')}
          onDockToBottom={() => onSetFaceLoupeMode?.('bottom')}
        />
      )}
      {photo.face_count && photo.face_count > 0 && faceLoupeMode !== 'sidebar' && (
        <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
          <span className="text-neutral-400 text-[11px]">
            Face Loupe: <span className="font-mono text-neutral-300 capitalize">{faceLoupeMode}</span>
          </span>
          <button
            type="button"
            onClick={() => onSetFaceLoupeMode?.('sidebar')}
            className="px-2 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            title="Dock Face Loupe inside this sidebar"
          >
            <Users size={11} />
            <span>Show here in sidebar</span>
          </button>
        </div>
      )}
    </div>
  )

  // Box 5: Shooting Context & Safeguards
  const renderContextBox = () => {
    const hasContext = photo.scene_name || photo.burst_group_id || photo.is_bokeh || photo.is_detail_shot || photo.is_motion_intentional || isStageLighting || isVip || (photo.camera_clock_offset !== undefined && photo.camera_clock_offset !== null && photo.camera_clock_offset !== 0)
    if (!hasContext) {
      return (
        <div className="text-neutral-500 text-xs italic text-center py-1">
          Standard single-camera capture
        </div>
      )
    }

    return (
      <div className="space-y-1.5">
        {photo.scene_name && (
          <div className="p-2 rounded-lg border border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs gap-2">
            <span className="text-neutral-400 flex items-center gap-1.5 font-medium shrink-0">
              <Bookmark size={12} className="text-indigo-400" /> Timeline
            </span>
            <span className="text-indigo-300 font-semibold truncate text-right max-w-[180px]">{photo.scene_name}</span>
          </div>
        )}

        {photo.burst_group_id && (
          <div className="p-2 rounded-lg border border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
            <span className="text-neutral-400 font-medium">Burst Series</span>
            {photo.is_burst_leader ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                <Crown size={11} /> 👑 Hero Frame
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">Candidate Shot</span>
            )}
          </div>
        )}

        {photo.is_bokeh && (
          <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg flex items-center gap-2 text-sky-400 text-xs">
            <Sparkles size={13} className="shrink-0" />
            <span>Intentional Bokeh (Preserved Shallow DoF)</span>
          </div>
        )}

        {photo.is_detail_shot && (
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
            <span className="text-sm">💍</span>
            <span>Detail / Flat-Lay Texture Shot</span>
          </div>
        )}

        {photo.is_motion_intentional && (
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-2 text-purple-300 text-xs">
            <span className="text-sm">🏎️</span>
            <span>Intentional Action Panning Blur</span>
          </div>
        )}

        {isStageLighting && (
          <div className="p-2 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg flex items-center gap-2 text-fuchsia-300 text-xs">
            <span className="text-sm">🎭</span>
            <span>Dramatic / Stage Lighting Protection</span>
          </div>
        )}

        {isVip && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2 text-yellow-300 text-xs font-medium">
            <Crown size={13} className="text-yellow-400 shrink-0" />
            <span>VIP Primary Subject in Focus</span>
          </div>
        )}

        {photo.camera_clock_offset !== undefined && photo.camera_clock_offset !== null && photo.camera_clock_offset !== 0 && (
          <div className="p-2 bg-neutral-950/80 border border-neutral-800 rounded-lg flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-neutral-400">
              <Clock size={12} className="text-blue-400" /> Multi-Cam Offset
            </span>
            <span className="font-mono font-bold text-blue-300">
              {photo.camera_clock_offset > 0 ? `+${photo.camera_clock_offset}s` : `${photo.camera_clock_offset}s`}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Box 6: Camera Settings (EXIF)
  const renderCameraBox = () => {
    const hasCamera = photo.camera_model || photo.shutter_speed || photo.aperture || photo.iso || photo.focal_length
    if (!hasCamera) {
      return (
        <div className="text-neutral-500 text-xs italic text-center py-1">
          No EXIF camera parameters found
        </div>
      )
    }

    return (
      <div>
        {photo.camera_model && (
          <p className="text-xs text-neutral-200 font-semibold mb-0.5 truncate">
            {[photo.camera_make, photo.camera_model].filter(Boolean).join(' ')}
          </p>
        )}
        {photo.lens_model && (
          <p className="text-[11px] text-neutral-400 mb-2 truncate font-mono">
            {photo.lens_model}
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5 bg-neutral-950/80 p-2 rounded-lg border border-neutral-800/90 text-xs font-mono">
          {photo.shutter_speed && (
            <div>
              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Shutter</span>
              <span className="text-neutral-200 font-bold">{photo.shutter_speed}</span>
            </div>
          )}
          {photo.aperture && (
            <div>
              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Aperture</span>
              <span className="text-neutral-200 font-bold">{photo.aperture}</span>
            </div>
          )}
          {photo.iso && (
            <div>
              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">ISO</span>
              <span className="text-neutral-200 font-bold">{photo.iso}</span>
            </div>
          )}
          {photo.focal_length && (
            <div>
              <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Focal</span>
              <span className="text-neutral-200 font-bold">{photo.focal_length}</span>
            </div>
          )}
        </div>

        {isShakeRisk && (
          <div className="mt-2 p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-1.5 text-amber-400 text-[11px]">
            <AlertTriangle size={12} className="shrink-0" />
            <span>Slow shutter for {photo.focal_length} (camera shake risk)</span>
          </div>
        )}
      </div>
    )
  }

  // Box 7: File Info
  const renderFileBox = () => (
    <div className="space-y-1.5 text-xs text-neutral-400 font-mono">
      <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
        <span className="flex items-center gap-1.5 font-sans text-neutral-400"><FileImage size={11} /> Format</span>
        <span className="text-neutral-200 font-bold">
          {photo.is_raw ? `RAW (${photo.raw_format?.toUpperCase() || 'RAW'})` : photo.filename.split('.').pop()?.toUpperCase()}
        </span>
      </div>
      {photo.width && photo.height && (
        <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
          <span className="font-sans text-neutral-400">Resolution</span>
          <span className="text-neutral-200">
            {photo.width} × {photo.height}
            <span className="text-neutral-500 ml-1 font-sans text-[11px]">
              ({((photo.width * photo.height) / 1000000).toFixed(1)} MP)
            </span>
          </span>
        </div>
      )}
      <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
        <span className="flex items-center gap-1.5 font-sans text-neutral-400"><HardDrive size={11} /> File Size</span>
        <span className="text-neutral-200">{formatBytes(photo.file_size)}</span>
      </div>
      {photo.exif_date && (
        <div className="flex justify-between items-center py-0.5 gap-2">
          <span className="flex items-center gap-1.5 font-sans text-neutral-400 shrink-0"><Calendar size={11} /> Captured</span>
          <span className="text-neutral-200 text-right truncate">{photo.exif_date.replace('T', ' ')}</span>
        </div>
      )}
    </div>
  )

  // Box: Culling Action Bar (Triage buttons)
  const renderCullingBox = () => (
    <div className="py-1">
      <CullingActionBar
        status={photo.status}
        isTagged={Boolean(photo.is_tagged)}
        onStatus={onStatus || ((st) => setPhotoStatusWithHistory(photo.id, st))}
        onToggleTag={onToggleTag || (() => togglePhotoTag(photo.id))}
        placement="sidebar"
        onSetPlacement={onSetTriagePlacement}
        scale="standard"
      />
    </div>
  )

  const MODULE_RENDERERS: Record<string, () => React.ReactNode> = {
    culling: renderCullingBox,
    histogram: renderHistogramBox,
    overall: renderOverallBox,
    reasons: renderReasonsBox,
    quality: renderQualityBox,
    people: renderPeopleBox,
    context: renderContextBox,
    camera: renderCameraBox,
    file: renderFileBox,
  }

  const MODULE_BADGES: Record<string, React.ReactNode | null> = {
    culling: (
      <span className={clsx(
        'text-[9px] font-bold px-1 rounded uppercase tracking-wider',
        photo.status === 'accepted' ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' :
        photo.status === 'rejected' ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' :
        'text-neutral-400 bg-neutral-800/60'
      )}>
        {photo.status}
      </span>
    ),
    histogram: histogramMode === 'sidebar' ? (
      <span className="text-[9px] text-purple-300 bg-purple-950/60 border border-purple-800/40 px-1 rounded font-mono">
        RGB
      </span>
    ) : null,
    overall: photo.overall_score !== null && photo.is_analyzed ? (
      <span className={clsx('text-[10px] font-bold px-1.5 py-0.2 rounded font-mono', scoreColor(photo.overall_score))}>
        {Math.round(photo.overall_score)}
      </span>
    ) : null,
    reasons: reasons?.positives?.length ? (
      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1 rounded">
        +{reasons.positives.length}
      </span>
    ) : null,
    quality: photo.blur_score !== null ? (
      <span className="text-[10px] text-neutral-400 font-mono">
        {Math.round(photo.blur_score)}s
      </span>
    ) : null,
    people: photo.face_count !== null && photo.face_count > 0 ? (
      <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950/60 px-1 rounded">
        {photo.face_count}
      </span>
    ) : null,
    context: photo.is_burst_leader ? (
      <span className="text-[10px] text-amber-400">👑</span>
    ) : null,
    camera: photo.shutter_speed ? (
      <span className="text-[10px] text-neutral-400 font-mono">
        {photo.shutter_speed}
      </span>
    ) : null,
    file: photo.is_raw ? (
      <span className="text-[9px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-1 rounded font-bold">
        RAW
      </span>
    ) : null,
  }

  return (
    <div className="p-3 text-sm h-full bg-neutral-900 overflow-hidden flex flex-col select-none">
      {/* Top Header: Dock Controls & Module Customizer */}
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setHeaderContextMenu({ x: e.clientX, y: e.clientY })
        }}
        className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-xs text-neutral-400 shrink-0 cursor-default select-none"
      >
        <div className="flex items-center gap-1.5 font-bold text-neutral-200">
          <Sliders size={13} className="text-blue-400" />
          <span>Inspector</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Customize Boxes Drawer Toggle */}
          <button
            onClick={() => setShowCustomizeDrawer(prev => !prev)}
            className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
              showCustomizeDrawer
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            )}
            title="Customize & Reorder Inspector Boxes"
          >
            <Settings2 size={12} />
            <span>Customize</span>
          </button>

          {/* Dock Controls */}
          {onSetDockMode && !isFloating && (
            <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-neutral-800">
              <button
                onClick={() => onSetDockMode('left')}
                className={`p-1 rounded cursor-pointer transition-colors ${
                  dockMode === 'left' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
                }`}
                title="Dock Inspector to Left"
              >
                <PanelLeft size={12} />
              </button>
              <button
                onClick={() => onSetDockMode('right')}
                className={`p-1 rounded cursor-pointer transition-colors ${
                  dockMode === 'right' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
                }`}
                title="Dock Inspector to Right"
              >
                <PanelRight size={12} />
              </button>
              <button
                onClick={() => onSetDockMode('floating')}
                className="p-1 text-neutral-500 hover:text-white rounded hover:bg-neutral-800 cursor-pointer transition-colors"
                title="Float Inspector as Movable Window"
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={() => onSetDockMode('collapsed')}
                className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 cursor-pointer transition-colors"
                title={dockMode === 'right' ? "Collapse Inspector (>>)" : "Collapse Inspector (<<)"}
              >
                {dockMode === 'right' ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Customize Drawer / Popover Panel */}
      {showCustomizeDrawer && (
        <div className="mb-3 p-3 bg-neutral-950/90 border border-neutral-800 rounded-xl shadow-xl shrink-0 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-800/80">
            <span className="text-xs font-bold text-neutral-200">Panel Layout & Groups</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = panelLayout === 'tabbed' ? 'accordion' : 'tabbed'
                  setPanelLayout(next)
                  setScoreStorage('panel_layout', next)
                }}
                className={clsx(
                  "px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer",
                  panelLayout === 'tabbed'
                    ? "bg-blue-600/30 text-blue-300 border-blue-500/50"
                    : "bg-neutral-800 text-neutral-400 border-neutral-700"
                )}
                title="Toggle between studio tab groups and vertical accordion"
              >
                {panelLayout === 'tabbed' ? <LayoutList size={11} /> : <Columns size={11} />}
                <span>{panelLayout === 'tabbed' ? 'Tab Groups' : 'Accordion'}</span>
              </button>
              <button
                onClick={handleResetLayout}
                className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer ml-1"
                title="Reset order and visibility to default"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-neutral-300">Visible Boxes</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetToDefaultGroups}
                className="text-[10px] text-blue-400 hover:underline cursor-pointer"
              >
                Default Groups
              </button>
              <span className="text-neutral-600">•</span>
              <button
                type="button"
                onClick={handleSplitAllIntoPanels}
                className="text-[10px] text-neutral-400 hover:text-white cursor-pointer"
              >
                Split All Panels
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {DEFAULT_MODULE_ORDER.map((id) => {
              const isVis = visibleModules[id] !== false
              return (
                <button
                  key={id}
                  onClick={() => handleToggleVisibility(id)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-left transition-colors cursor-pointer border',
                    isVis
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-200 font-medium'
                      : 'bg-neutral-950/40 border-neutral-900 text-neutral-500 line-through'
                  )}
                >
                  {isVis ? <CheckSquare size={12} className="text-blue-400 shrink-0" /> : <Square size={12} className="text-neutral-600 shrink-0" />}
                  <span className="truncate">{MODULE_TITLES[id] || id}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
            <Info size={11} className="text-neutral-400 shrink-0" />
            <span>Drag tabs to split lines to create new groups, or drag to canvas to float.</span>
          </div>
        </div>
      )}

      {/* Pinned Culling Action Bar (When in Sidebar Placement) */}
      {triagePlacement === 'sidebar' && (
        <div className="mb-2 pb-2 border-b border-neutral-800 shrink-0">
          <CullingActionBar
            status={photo.status}
            isTagged={Boolean(photo.is_tagged)}
            onStatus={onStatus || ((st) => setPhotoStatusWithHistory(photo.id, st))}
            onToggleTag={onToggleTag || (() => togglePhotoTag(photo.id))}
            placement="sidebar"
            onSetPlacement={onSetTriagePlacement}
            scale="standard"
          />
        </div>
      )}

      {/* Panel Body: Studio Dock Groups (Default) or Accordion List */}
      {panelLayout === 'tabbed' ? (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 pr-1 -mr-1 space-y-1">
          {dockGroups.map((group, groupIndex) => {
            const isDragActive = dragState.isDragging && dragState.item?.type === 'module-tab'
            const isSplitTarget = isDragActive && dragState.dropTarget?.type === 'split-line' && dragState.dropTarget.groupIndex === groupIndex
            const isTabGroupTarget = isDragActive && dragState.dropTarget?.type === 'tab-group' && dragState.dropTarget.groupId === group.id

            // Check if visible
            const visibleTabs = group.tabs.filter(t => visibleModules[t] !== false)
            if (visibleTabs.length === 0) return null

            // Ensure activeTab is valid
            const activeTab = visibleTabs.includes(group.activeTab) ? group.activeTab : visibleTabs[0]
            const activeRenderer = MODULE_RENDERERS[activeTab]
            const activePlacement = getPlacement(activeTab)

            return (
              <React.Fragment key={group.id}>
                {/* Split Line Drop Zone before this group */}
                <SplitLineDropZone
                  index={groupIndex}
                  isDragActive={isDragActive}
                  isTarget={isSplitTarget}
                />

                {/* Panel Group Card */}
                <div className="bg-neutral-900/95 border border-neutral-800 rounded-xl overflow-hidden shadow-sm transition-all duration-150">
                  {/* Tab Header Bar */}
                  <div
                    data-tab-group-id={group.id}
                    onDoubleClick={() => handleToggleGroupCollapse(group.id)}
                    className={clsx(
                      "flex items-center justify-between px-1.5 py-1 bg-neutral-900/90 border-b border-neutral-800 select-none transition-colors",
                      isTabGroupTarget && "bg-blue-950/60 border-blue-500 ring-2 ring-blue-500"
                    )}
                  >
                    {/* Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0 pr-1">
                      {visibleTabs.map((tabId) => {
                        const isActive = activeTab === tabId
                        const title = MODULE_TITLES[tabId] || tabId
                        const icon = MODULE_ICONS[tabId]
                        const placement = getPlacement(tabId)
                        const isDetached = placement !== 'sidebar'

                        return (
                          <div
                            key={tabId}
                            onPointerDown={(e) => handleTabPointerDown(e, tabId, group.id)}
                            onClick={() => handleSelectTab(group.id, tabId)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setTabContextMenu({ x: e.clientX, y: e.clientY, tabId, groupId: group.id })
                            }}
                            className={clsx(
                              "group/tab flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-grab active:cursor-grabbing transition-all shrink-0",
                              isActive
                                ? "bg-neutral-800 text-white shadow border border-neutral-700/80"
                                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850",
                              isDetached && "opacity-50 italic"
                            )}
                            title={`Click to view, drag to move or float ${title}`}
                          >
                            <GripVertical size={11} className="text-neutral-500 group-hover/tab:text-neutral-300 shrink-0" />
                            <span className="shrink-0">{icon}</span>
                            <span className="truncate max-w-[105px]">{title}</span>
                            {isDetached && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                                {placement === 'floating' ? '↗' : '⚓'}
                              </span>
                            )}
                          </div>
                        )
                      })}

                      {isTabGroupTarget && (
                        <div className="px-2 py-0.5 rounded border border-dashed border-blue-400 bg-blue-500/20 text-blue-200 text-[10px] font-semibold animate-pulse shrink-0">
                          + Add Tab
                        </div>
                      )}
                    </div>

                    {/* Right Controls */}
                    <div className="flex items-center gap-0.5 shrink-0 pl-1 border-l border-neutral-800">
                      <button
                        type="button"
                        onClick={() => handleToggleGroupCollapse(group.id)}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                        title={group.isCollapsed ? "Expand Group" : "Collapse Group"}
                      >
                        {group.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setGroupMenuState({ x: e.clientX, y: e.clientY, group })
                        }}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Group Options"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Group Content Body */}
                  {!group.isCollapsed && (
                    <div className="p-3">
                      {activePlacement === 'sidebar' ? (
                        activeRenderer ? activeRenderer() : null
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 text-center bg-neutral-950/40 rounded-lg border border-neutral-800/60">
                          <span className="mb-1 text-neutral-400">{MODULE_ICONS[activeTab]}</span>
                          <p className="text-xs text-neutral-400 mb-2">
                            {activePlacement === 'floating'
                              ? `${MODULE_TITLES[activeTab] || activeTab} is floating on canvas`
                              : `${MODULE_TITLES[activeTab] || activeTab} is docked in Bottom Bar`}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleSetPlacement(activeTab, 'sidebar')}
                            className="px-2.5 py-1 text-[11px] bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 rounded-lg transition-colors cursor-pointer"
                          >
                            Dock {MODULE_TITLES[activeTab] || activeTab} Here
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          })}

          {/* Final Split Line Drop Zone after all groups */}
          <SplitLineDropZone
            index={dockGroups.length}
            isDragActive={dragState.isDragging && dragState.item?.type === 'module-tab'}
            isTarget={dragState.isDragging && dragState.dropTarget?.type === 'split-line' && dragState.dropTarget.groupIndex === dockGroups.length}
          />
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 pr-1 -mr-1">
          {modulesOrder
            .filter(id => visibleModules[id] !== false)
            .map((id, index, filteredArr) => {
              const renderer = MODULE_RENDERERS[id]
              if (!renderer) return null

              const placement = getPlacement(id)
              const isDockedInSidebar = placement === 'sidebar'

              return (
                <InspectorBox
                  key={id}
                  id={id}
                  title={MODULE_TITLES[id] || id}
                  icon={MODULE_ICONS[id]}
                  badge={MODULE_BADGES[id]}
                  isCollapsed={Boolean(collapsedModules[id])}
                  onToggleCollapse={() => handleToggleCollapse(id)}
                  canMoveUp={index > 0}
                  canMoveDown={index < filteredArr.length - 1}
                  onMoveUp={() => handleMoveUp(id)}
                  onMoveDown={() => handleMoveDown(id)}
                  onDragStart={(dragId) => setDraggedId(dragId)}
                  onDragOver={(overId) => setDragOverId(overId)}
                  onDrop={handleDrop}
                  isDragging={draggedId === id}
                  isDragOver={dragOverId === id}
                  onUndock={() => handleSetPlacement(id, 'floating')}
                  onDockToBottom={() => handleSetPlacement(id, 'bottom')}
                  onDockToSidebar={() => handleSetPlacement(id, 'sidebar')}
                  undockTitle={`Float ${MODULE_TITLES[id] || id} as movable window`}
                >
                  {isDockedInSidebar ? (
                    renderer()
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center bg-neutral-950/40 rounded-lg border border-neutral-800/60">
                      <span className="mb-1 text-neutral-400">{MODULE_ICONS[id]}</span>
                      <p className="text-xs text-neutral-400 mb-2">
                        {placement === 'floating'
                          ? `${MODULE_TITLES[id] || id} is floating on canvas`
                          : `${MODULE_TITLES[id] || id} is docked in Bottom Bar`}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleSetPlacement(id, 'sidebar')}
                        className="px-2.5 py-1 text-[11px] bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 rounded-lg transition-colors cursor-pointer"
                      >
                        Dock {MODULE_TITLES[id] || id} Here
                      </button>
                    </div>
                  )}
                </InspectorBox>
              )
            })}
        </div>
      )}

      {/* Header Context Menu */}
      {headerContextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setHeaderContextMenu(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[190px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 180, headerContextMenu.y),
              left: Math.min(window.innerWidth - 200, headerContextMenu.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
              Inspector Sidebar
            </div>
            {onSetDockMode && (
              <>
                <button
                  onClick={() => {
                    setHeaderContextMenu(null)
                    onSetDockMode('floating')
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
                >
                  <ExternalLink size={13} className="text-blue-400" />
                  <span>Float Inspector as Window</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderContextMenu(null)
                    onSetDockMode('right')
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
                >
                  <PanelRight size={13} className="text-neutral-400" />
                  <span>Dock to Right Side</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderContextMenu(null)
                    onSetDockMode('left')
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
                >
                  <PanelLeft size={13} className="text-neutral-400" />
                  <span>Dock to Left Side</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderContextMenu(null)
                    onSetDockMode('collapsed')
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
                >
                  <ChevronsRight size={13} className="text-neutral-400" />
                  <span>Collapse Inspector (Tab)</span>
                </button>
                <div className="border-t border-neutral-800 my-0.5" />
              </>
            )}
            <button
              onClick={() => {
                setHeaderContextMenu(null)
                setShowCustomizeDrawer(prev => !prev)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <Settings2 size={13} className="text-neutral-400" />
              <span>Customize Boxes...</span>
            </button>
          </div>
        </>
      )}

      {/* Group Context Menu */}
      {groupMenuState && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setGroupMenuState(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[210px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 200, groupMenuState.y),
              left: Math.min(window.innerWidth - 220, groupMenuState.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800 flex items-center justify-between">
              <span>Panel Group</span>
              <span className="font-mono text-neutral-500">{groupMenuState.group.tabs.length} tabs</span>
            </div>

            <button
              onClick={() => {
                const activeTab = groupMenuState.group.activeTab
                setGroupMenuState(null)
                handleSetPlacement(activeTab, 'floating')
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
            >
              <ExternalLink size={13} className="text-blue-400" />
              <span>Float Active Tab as Window</span>
            </button>

            <button
              onClick={() => {
                const activeTab = groupMenuState.group.activeTab
                setGroupMenuState(null)
                handleSetPlacement(activeTab, 'bottom')
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <Anchor size={13} className="text-neutral-400" />
              <span>Dock Active Tab to Bottom Bar</span>
            </button>

            <div className="border-t border-neutral-800 my-0.5" />

            {groupMenuState.group.tabs.length > 1 && (
              <button
                onClick={() => {
                  const gid = groupMenuState.group.id
                  setGroupMenuState(null)
                  handleSplitGroupIntoPanels(gid)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <Split size={13} className="text-neutral-400" />
                <span>Split Tabs into Separate Panels</span>
              </button>
            )}

            <button
              onClick={() => {
                const gid = groupMenuState.group.id
                setGroupMenuState(null)
                handleToggleGroupCollapse(gid)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <ChevronsRight size={13} className="text-neutral-400" />
              <span>{groupMenuState.group.isCollapsed ? 'Expand Group' : 'Collapse Group Content'}</span>
            </button>

            <div className="border-t border-neutral-800 my-0.5" />

            <button
              onClick={() => {
                setGroupMenuState(null)
                handleResetToDefaultGroups()
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Reset to Default Groups</span>
            </button>
          </div>
        </>
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setTabContextMenu(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[200px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 200, tabContextMenu.y),
              left: Math.min(window.innerWidth - 210, tabContextMenu.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
              {MODULE_TITLES[tabContextMenu.tabId] || tabContextMenu.tabId}
            </div>

            <button
              onClick={() => {
                const tab = tabContextMenu.tabId
                setTabContextMenu(null)
                handleSetPlacement(tab, 'floating')
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
            >
              <ExternalLink size={13} className="text-blue-400" />
              <span>Float as Movable Window</span>
            </button>

            <button
              onClick={() => {
                const tab = tabContextMenu.tabId
                setTabContextMenu(null)
                handleSetPlacement(tab, 'bottom')
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <Anchor size={13} className="text-neutral-400" />
              <span>Dock to Bottom Stage Bar</span>
            </button>

            <button
              onClick={() => {
                const { tabId, groupId } = tabContextMenu
                setTabContextMenu(null)
                const groupIdx = dockGroups.findIndex(g => g.id === groupId)
                handleExecuteDrop(tabId, groupId, { type: 'split-line', groupIndex: groupIdx + 1, position: 'between' })
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <Split size={13} className="text-neutral-400" />
              <span>Split into New Group Below</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function InspectorModuleContent({
  moduleId,
  photo,
  compact = false,
  onSelectFace,
  onResetZoom,
  zoomLevel = 1,
}: {
  moduleId: string
  photo: Photo
  compact?: boolean
  onSelectFace?: (box: [number, number, number, number]) => void
  onResetZoom?: () => void
  zoomLevel?: number
}) {
  const { startAnalysis, isAnalyzing } = usePhotosStore()
  const isShakeRisk = checkCameraShake(photo.shutter_speed, photo.focal_length)

  let reasons: any = null
  try {
    if (photo.reasons_json) {
      reasons = typeof photo.reasons_json === 'string' ? JSON.parse(photo.reasons_json) : photo.reasons_json
    }
  } catch {}

  if (moduleId === 'culling') {
    return (
      <div className="py-1">
        <CullingActionBar
          status={photo.status}
          isTagged={Boolean(photo.is_tagged)}
          onStatus={(st) => usePhotosStore.getState().setPhotoStatusWithHistory(photo.id, st)}
          onToggleTag={() => usePhotosStore.getState().togglePhotoTag(photo.id)}
          placement="sidebar"
          scale={compact ? 'compact' : 'standard'}
        />
      </div>
    )
  }

  if (moduleId === 'histogram') {
    return (
      <HistogramChart
        imageUrl={api.getFullImageUrl(photo.id)}
        compact={compact}
      />
    )
  }

  if (moduleId === 'overall') {
    return (
      <div className={clsx("flex flex-col items-center", compact ? "py-1" : "pt-1 pb-1")}>
        <div className={`text-3xl font-bold mb-0.5 tracking-tight ${scoreColor(photo.overall_score)}`}>
          {photo.overall_score !== null && photo.is_analyzed ? Math.round(photo.overall_score) : '—'}
        </div>
        <div className="text-neutral-500 text-[11px] mb-2 font-medium">
          {photo.is_analyzed ? 'Calculated Overall Score' : 'Analysis Pending'}
        </div>
        <div className={clsx(
          'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
          photo.status === 'accepted' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/80 shadow-sm' :
          photo.status === 'rejected' ? 'bg-rose-900/50 text-rose-300 border border-rose-700/80 shadow-sm' :
          'bg-neutral-800 text-neutral-400 border border-neutral-700'
        )}>
          {photo.status}
        </div>
        {!photo.is_analyzed && (
          <div className="mt-2 w-full p-2 rounded-lg border border-amber-900/60 bg-amber-950/20 text-amber-200">
            <button
              onClick={() => startAnalysis([photo.id])}
              disabled={isAnalyzing}
              className="w-full py-1 px-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow"
            >
              <Sparkles size={12} className={isAnalyzing ? 'animate-spin' : ''} />
              <span>{isAnalyzing ? 'Analyzing...' : 'Analyze This Photo'}</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  if (moduleId === 'reasons') {
    if (!reasons) {
      return (
        <div className="text-neutral-500 text-xs italic text-center py-2">
          {photo.is_analyzed ? 'No specific rule triggers detected.' : 'Insights available after AI analysis.'}
        </div>
      )
    }
    return (
      <div>
        {reasons.summary && (
          <p className="text-xs text-neutral-200 leading-relaxed mb-2 font-medium">
            {reasons.summary}
          </p>
        )}
        {reasons.positives && reasons.positives.length > 0 && (
          <div className="space-y-1 mb-2">
            {reasons.positives.map((pos: string, i: number) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-2 py-1">
                <Check size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{pos}</span>
              </div>
            ))}
          </div>
        )}
        {reasons.rejections && reasons.rejections.length > 0 && (
          <div className="space-y-1">
            {reasons.rejections.map((rej: string, i: number) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg px-2 py-1">
                <X size={12} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{rej}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (moduleId === 'quality') {
    return (
      <div className={compact ? "grid grid-cols-2 gap-2" : ""}>
        <ScoreBar label="🎯 Sharpness" score={photo.blur_score} color={barColor(photo.blur_score)} />
        <ScoreBar label="💡 Exposure" score={photo.exposure_score} color={barColor(photo.exposure_score)} />
        <ScoreBar label="✨ Aesthetic" score={photo.aesthetic_score} color={barColor(photo.aesthetic_score)} />
        <ScoreBar label="📐 Composition" score={photo.composition_score} color={barColor(photo.composition_score)} />
      </div>
    )
  }

  if (moduleId === 'people') {
    return (
      <div>
        <div className="flex items-center gap-2 text-neutral-300 text-xs mb-1.5">
          <Users size={14} className="text-indigo-400" />
          <span>{photo.face_count === null ? 'Analysis pending' : photo.face_count === 0 ? 'No faces detected' : `${photo.face_count} subject face${photo.face_count > 1 ? 's' : ''}`}</span>
        </div>
        {photo.face_count && photo.face_count > 0 && (
          <FaceLoupe
            photoId={photo.id}
            layout="sidebar"
            onSelectFace={onSelectFace}
            onResetZoom={onResetZoom}
            zoomLevel={zoomLevel}
          />
        )}
      </div>
    )
  }

  if (moduleId === 'context') {
    return (
      <div className="space-y-1.5">
        {photo.scene_name && (
          <div className="p-2 rounded-lg border border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
            <span className="text-neutral-400 flex items-center gap-1.5 font-medium"><Bookmark size={12} className="text-indigo-400" /> Chapter</span>
            <span className="text-indigo-300 font-semibold">{photo.scene_name}</span>
          </div>
        )}
        {photo.burst_group_id && (
          <div className="p-2 rounded-lg border border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
            <span className="text-neutral-400 font-medium">Burst Series</span>
            {photo.is_burst_leader ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                <Crown size={11} /> 👑 Hero Frame
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">Candidate Shot</span>
            )}
          </div>
        )}
        {photo.is_bokeh && (
          <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg flex items-center gap-2 text-sky-400 text-xs">
            <Sparkles size={13} className="shrink-0" />
            <span>Intentional Bokeh (Preserved Shallow DoF)</span>
          </div>
        )}
        {photo.is_detail_shot && (
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
            <span>💍 Detail / Flat-Lay Shot</span>
          </div>
        )}
      </div>
    )
  }

  if (moduleId === 'camera') {
    return (
      <div>
        {photo.camera_model && (
          <p className="text-xs text-neutral-200 font-semibold mb-0.5 truncate">
            {[photo.camera_make, photo.camera_model].filter(Boolean).join(' ')}
          </p>
        )}
        {photo.lens_model && (
          <p className="text-[11px] text-neutral-400 mb-2 truncate font-mono">
            {photo.lens_model}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-neutral-950/80 p-2 rounded-lg border border-neutral-800/90 text-xs font-mono">
          {photo.shutter_speed && (
            <div><span className="text-neutral-500 block text-[9px] uppercase">Shutter</span><span className="text-neutral-200 font-bold">{photo.shutter_speed}</span></div>
          )}
          {photo.aperture && (
            <div><span className="text-neutral-500 block text-[9px] uppercase">Aperture</span><span className="text-neutral-200 font-bold">{photo.aperture}</span></div>
          )}
          {photo.iso && (
            <div><span className="text-neutral-500 block text-[9px] uppercase">ISO</span><span className="text-neutral-200 font-bold">{photo.iso}</span></div>
          )}
          {photo.focal_length && (
            <div><span className="text-neutral-500 block text-[9px] uppercase">Focal</span><span className="text-neutral-200 font-bold">{photo.focal_length}</span></div>
          )}
        </div>
        {isShakeRisk && (
          <div className="mt-2 p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-1.5 text-amber-400 text-[11px]">
            <AlertTriangle size={12} className="shrink-0" />
            <span>Slow shutter for {photo.focal_length} (camera shake risk)</span>
          </div>
        )}
      </div>
    )
  }

  if (moduleId === 'file') {
    return (
      <div className="space-y-1.5 text-xs text-neutral-400 font-mono">
        <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
          <span className="font-sans text-neutral-400">Format</span>
          <span className="text-neutral-200 font-bold">{photo.is_raw ? `RAW (${photo.raw_format?.toUpperCase() || 'RAW'})` : photo.filename.split('.').pop()?.toUpperCase()}</span>
        </div>
        {photo.width && photo.height && (
          <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
            <span className="font-sans text-neutral-400">Resolution</span>
            <span className="text-neutral-200">{photo.width} × {photo.height}</span>
          </div>
        )}
        <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/50">
          <span className="font-sans text-neutral-400">Size</span>
          <span className="text-neutral-200">{formatBytes(photo.file_size)}</span>
        </div>
        {photo.exif_date && (
          <div className="flex justify-between items-center py-0.5">
            <span className="font-sans text-neutral-400">Captured</span>
            <span className="text-neutral-200">{photo.exif_date.replace('T', ' ')}</span>
          </div>
        )}
      </div>
    )
  }

  return null
}
