import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, X, SkipForward, Maximize2, RefreshCw,
  Zap, Eye, Columns, Sliders, PanelLeft, PanelRight, PanelBottom,
  Palette, Moon, Info, ChevronDown, SlidersHorizontal, RotateCcw, Sparkles,
  ChevronsRight, ChevronsLeft, Anchor, GripVertical, Minus, Square, MoreHorizontal,
  ExternalLink, Pin, Crown, Split, Film, ArrowLeftRight, LayoutGrid, FolderUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getApiToken, initApiToken } from '../api/client'
import type { Photo, DuplicateGroup } from '../types/photo'
import ScorePanel, {
  DockMode,
  PanelDockPlacement,
  DEFAULT_MODULE_PLACEMENTS,
  DEFAULT_MODULE_ORDER,
  MODULE_TITLES,
  MODULE_ICONS,
  InspectorModuleContent
} from '../components/ScorePanel'
import FaceLoupe, { toggleVipFaceStatus } from '../components/FaceLoupe'
import Filmstrip from '../components/Filmstrip'
import ClippingOverlay from '../components/ClippingOverlay'
import HistogramWidget, { HistogramChart } from '../components/HistogramWidget'
import DraggablePanel from '../components/DraggablePanel'
import ThemePickerModal from '../components/ThemePickerModal'
import PanelSelectorModal, { PanelKey } from '../components/PanelSelectorModal'
import InfoOverlay, { HudMode } from '../components/InfoOverlay'
import CullingActionBar, { TriagePlacement, TriageScale } from '../components/CullingActionBar'
import DragGhostOverlay from '../components/DragGhostOverlay'
import FirstPassLoader from '../components/FirstPassLoader'
import { dockDragManager, DragState, DropTarget } from '../utils/dockDragManager'
import {
  CANVAS_BACKDROP_OPTIONS,
  getStoredCanvasBackdrop,
  setStoredCanvasBackdrop,
  CanvasBackdropMode
} from '../theme/themes'
import {
  getAllWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  saveCustomWorkspace,
  deleteCustomWorkspace,
  resetWorkspace,
  PRESET_WORKSPACES,
  WorkspaceLayout
} from '../utils/workspaceManager'
import { usePhotosStore } from '../store/photosStore'
import { preloadAdjacentPhotos, preloadAndDecodeImage, isImageDecoded } from '../utils/imagePreloader'
import clsx from 'clsx'

export interface BottomGroup {
  id: string
  tabs: string[]
  activeTab: string
  widthRatio: number
}

function getReviewStorage(key: string): string | null {
  try {
    return localStorage.getItem(`firstpass_${key}`) ?? localStorage.getItem(`photo_culler_${key}`)
  } catch {
    return null
  }
}

function setReviewStorage(key: string, value: string): void {
  try {
    localStorage.setItem(`firstpass_${key}`, value)
    localStorage.setItem(`photo_culler_${key}`, value)
  } catch {}
}

export default function Review() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    photos,
    updatePhotoStatusLocal,
    setPhotoStatusWithUndo,
    undo,
    redo,
    setLastReviewedPhotoId,
    setActivePhotoId,
    autoAdvance,
    toggleAutoAdvance,
    filmstripPosition,
    setFilmstripPosition,
    togglePhotoTag
  } = usePhotosStore()

  const photoId = parseInt(id || '0', 10)
  const storePhoto = photos.find(p => p.id === photoId)

  const [photo, setPhoto] = useState<Photo | null>(() => storePhoto || null)
  const [loading, setLoading] = useState(() => !storePhoto)
  const [fullscreen, setFullscreen] = useState(false)
  const [duplicateGroup, setDuplicateGroup] = useState<Photo[]>([])
  const [fullLoaded, setFullLoaded] = useState(() => isImageDecoded(api.getFullImageUrl(photoId)))
  const [authToken, setAuthToken] = useState<string>(() => getApiToken())

  useEffect(() => {
    const handleTokenReady = (e: Event) => {
      const token = (e as CustomEvent).detail
      if (token && token !== authToken) {
        setAuthToken(token)
      }
    }
    window.addEventListener('firstpass:token-ready', handleTokenReady)
    return () => window.removeEventListener('firstpass:token-ready', handleTokenReady)
  }, [authToken])
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 })
  const [zoomedFace, setZoomedFace] = useState<{ index: number; isVip: boolean } | null>(null)
  const [isHoldingZoom, setIsHoldingZoom] = useState(false)
  const isMouseDownRef = useRef(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [showClipping, setShowClipping] = useState(false)
  type HistogramMode = 'sidebar' | 'bottom' | 'floating' | 'hidden'
  const [histogramMode, setHistogramMode] = useState<HistogramMode>(() => {
    try {
      const saved = getReviewStorage('histogram_mode') as HistogramMode
      if (saved && ['sidebar', 'bottom', 'floating', 'hidden'].includes(saved)) return saved
    } catch {}
    return 'sidebar'
  })

  // Full inspector module placements (supports moving ANY inspector item to floating, bottom, or sidebar)
  const [modulePlacements, setModulePlacements] = useState<Record<string, PanelDockPlacement>>(() => {
    try {
      const saved = getReviewStorage('module_placements')
      if (saved) {
        const parsed = JSON.parse(saved)
        return { ...DEFAULT_MODULE_PLACEMENTS, ...parsed }
      }
    } catch {}
    return DEFAULT_MODULE_PLACEMENTS
  })

  const [activeBottomTab, setActiveBottomTab] = useState<string>('people')

  const setHistogramModeAndStore = useCallback((mode: HistogramMode) => {
    setHistogramMode(mode)
    setReviewStorage('histogram_mode', mode)
    setModulePlacements(prev => {
      if (prev.histogram === mode) return prev
      const updated = { ...prev, histogram: mode as PanelDockPlacement }
      setReviewStorage('module_placements', JSON.stringify(updated))
      return updated
    })
  }, [])

  const cycleHistogram = useCallback(() => {
    setHistogramMode(prev => {
      let next: HistogramMode
      if (prev === 'sidebar') next = 'floating'
      else if (prev === 'floating') next = 'bottom'
      else if (prev === 'bottom') next = 'hidden'
      else next = 'sidebar'
      setReviewStorage('histogram_mode', next)
      setModulePlacements(p => {
        const u = { ...p, histogram: next }
        setReviewStorage('module_placements', JSON.stringify(u))
        return u
      })
      toast(
        next === 'sidebar' ? 'Histogram: Docked in Sidebar' :
        next === 'floating' ? 'Histogram: Floating Window' :
        next === 'bottom' ? 'Histogram: Docked in Bottom Bar' :
        'Histogram: Hidden',
        { id: 'histogram-toast', icon: '📊' }
      )
      return next
    })
  }, [])

  // Studio Themes & Visual Evaluation Tools
  const [canvasBackdrop, setCanvasBackdropState] = useState<CanvasBackdropMode>(getStoredCanvasBackdrop)
  const [lightsOutLevel, setLightsOutLevel] = useState<0 | 1 | 2>(0)
  const [hudMode, setHudMode] = useState<HudMode>(() => {
    try {
      const saved = getReviewStorage('hud_mode')
      if (saved) return parseInt(saved, 10) as HudMode
    } catch {}
    return 1
  })
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showBackdropMenu, setShowBackdropMenu] = useState(false)

  const cycleLightsOut = useCallback(() => {
    setLightsOutLevel(prev => {
      const next = ((prev + 1) % 3) as 0 | 1 | 2
      if (next === 1) toast('Lights Out (85% Dim)', { id: 'lights-toast', icon: '🌘' })
      else if (next === 2) toast('Lights Out (Full Blackout)', { id: 'lights-toast', icon: '🌑' })
      else toast('Lights On', { id: 'lights-toast', icon: '☀️' })
      return next
    })
  }, [])

  const cycleHud = useCallback(() => {
    setHudMode(prev => {
      const next = ((prev + 1) % 3) as HudMode
      setReviewStorage('hud_mode', String(next))
      return next
    })
  }, [])

  const setCanvasBackdrop = useCallback((mode: CanvasBackdropMode) => {
    setCanvasBackdropState(mode)
    setStoredCanvasBackdrop(mode)
    setShowBackdropMenu(false)
  }, [])

  // Flexible Sidebar Docking (Right | Left | Floating | Collapsed)
  const [scorePanelDock, setScorePanelDockState] = useState<DockMode>(() => {
    try {
      const saved = getReviewStorage('score_dock') as DockMode
      if (saved && ['right', 'left', 'floating', 'collapsed'].includes(saved)) return saved
    } catch {}
    return 'right'
  })

  const lastActiveDockRef = useRef<DockMode>(scorePanelDock === 'collapsed' ? 'right' : scorePanelDock)

  const setScorePanelDock = useCallback((mode: DockMode) => {
    if (mode !== 'collapsed') {
      lastActiveDockRef.current = mode
    }
    setScorePanelDockState(mode)
    setReviewStorage('score_dock', mode)
  }, [])

  // Moveable & Adaptive Culling / Triage Action Bar
  const [triagePlacement, setTriagePlacement] = useState<TriagePlacement>(() => {
    try {
      const saved = getReviewStorage('triage_placement') as TriagePlacement
      if (saved && ['bottom', 'side-left', 'side-right', 'floating', 'sidebar'].includes(saved)) return saved
    } catch {}
    return 'bottom'
  })

  const [triageScale, setTriageScale] = useState<TriageScale>(() => {
    try {
      const saved = getReviewStorage('triage_scale') as TriageScale
      if (saved && ['compact', 'standard', 'large'].includes(saved)) return saved
    } catch {}
    return 'standard'
  })

  // Culling Action Bar visibility (Adobe-style show/hide, independent of placement)
  const [showCullingBar, setShowCullingBar] = useState<boolean>(() => {
    try {
      const saved = getReviewStorage('culling_bar_visible')
      if (saved === 'false') return false
    } catch {}
    return true
  })

  const setShowCullingBarAndStore = useCallback((visible: boolean) => {
    setShowCullingBar(visible)
    setReviewStorage('culling_bar_visible', String(visible))
  }, [])

  // Adobe-style Panel Selector (Window > Customize Panels...)
  const [showPanelSelector, setShowPanelSelector] = useState(false)

  const toggleScorePanel = useCallback(() => {
    setScorePanelDockState(prev => {
      const next = prev === 'collapsed' ? (lastActiveDockRef.current || 'right') : 'collapsed'
      setReviewStorage('score_dock', next)
      return next
    })
  }, [])

  const [scorePanelWidth, setScorePanelWidth] = useState<number>(() => {
    try {
      const saved = getReviewStorage('score_width')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (parsed >= 240 && parsed <= 550) return parsed
      }
    } catch {}
    return 320
  })

  type FaceLoupeMode = 'sidebar' | 'bottom' | 'floating' | 'hidden'
  const [faceLoupeMode, setFaceLoupeMode] = useState<FaceLoupeMode>(() => {
    try {
      const saved = getReviewStorage('faceloupe_mode')
      if (saved) return saved as FaceLoupeMode
      const oldFloat = getReviewStorage('faceloupe_floating')
      if (oldFloat === 'true') return 'floating'
      if (oldFloat === 'false') return 'bottom'
    } catch {}
    return 'sidebar'
  })

  const setFaceLoupeModeAndStore = useCallback((mode: FaceLoupeMode) => {
    setFaceLoupeMode(mode)
    setReviewStorage('faceloupe_mode', mode)
    setModulePlacements(prev => {
      if (prev.people === mode) return prev
      const updated = { ...prev, people: mode as PanelDockPlacement }
      setReviewStorage('module_placements', JSON.stringify(updated))
      return updated
    })
  }, [])

  const setModulePlacement = useCallback((id: string, placement: PanelDockPlacement, floatPos?: { x: number; y: number }) => {
    setModulePlacements(prev => {
      const updated = { ...prev, [id]: placement }
      setReviewStorage('module_placements', JSON.stringify(updated))
      return updated
    })

    if (id === 'histogram') {
      setHistogramMode(placement as HistogramMode)
      setReviewStorage('histogram_mode', placement)
    } else if (id === 'people') {
      setFaceLoupeMode(placement as FaceLoupeMode)
      setReviewStorage('faceloupe_mode', placement)
    }

    if (floatPos) {
      setReviewStorage(`panel_pos_${id}`, JSON.stringify(floatPos))
    }

    if (placement === 'bottom') {
      setBottomGroups(prev => {
        const existingGroupIdx = prev.findIndex(g => g.tabs.includes(id))
        let next: BottomGroup[] = []
        if (existingGroupIdx !== -1) {
          next = prev.map((g, idx) => idx === existingGroupIdx ? { ...g, activeTab: id } : g)
        } else if (prev.length > 0) {
          next = prev.map((g, idx) => idx === 0 ? { ...g, tabs: [...g.tabs, id], activeTab: id } : g)
        } else {
          next = [{ id: `bottom-group-${Date.now()}`, tabs: [id], activeTab: id, widthRatio: 1 }]
        }
        setReviewStorage('bottom_groups', JSON.stringify(next))
        return next
      })
    } else {
      setBottomGroups(prev => {
        const next = prev.map(g => {
          const remTabs = g.tabs.filter(t => t !== id)
          return {
            ...g,
            tabs: remTabs,
            activeTab: g.activeTab === id ? remTabs[0] || '' : g.activeTab
          }
        }).filter(g => g.tabs.length > 0)
        setReviewStorage('bottom_groups', JSON.stringify(next))
        return next
      })
    }

    const title = MODULE_TITLES[id] || id
    toast(
      placement === 'sidebar' ? `${title}: Docked in Sidebar` :
      placement === 'bottom' ? `${title}: Docked in Bottom Bar` :
      placement === 'floating' ? `${title}: Floating Window` :
      `${title}: Hidden`,
      { id: `module-placement-${id}`, icon: placement === 'sidebar' ? '📌' : placement === 'bottom' ? '⚓' : '🪟' }
    )
  }, [])

  // Bottom Stage Bar Horizontal Split Groups (Studio Multi-Column)
  const [bottomGroups, setBottomGroups] = useState<BottomGroup[]>(() => {
    try {
      const saved = getReviewStorage('bottom_groups')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [{
      id: 'bottom-group-0',
      tabs: ['people'],
      activeTab: 'people',
      widthRatio: 1,
    }]
  })

  const saveBottomGroups = useCallback((groups: BottomGroup[]) => {
    setBottomGroups(groups)
    setReviewStorage('bottom_groups', JSON.stringify(groups))
  }, [])

  const allBottomTabs = Array.from(new Set(bottomGroups.flatMap(g => g.tabs)))
  const bottomModules = allBottomTabs

  // 60fps Universal Drag Subscription
  const [dragState, setDragState] = useState<DragState>(dockDragManager.getState())
  useEffect(() => {
    return dockDragManager.subscribe(setDragState)
  }, [])

  const [columnMenuAnchor, setColumnMenuAnchor] = useState<{
    id: string
    groupIndex: number
    activeTab: string
    x: number
    y: number
  } | null>(null)

  // Modular Workspace Layouts System
  const [workspaces, setWorkspaces] = useState<WorkspaceLayout[]>(getAllWorkspaces)
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(getActiveWorkspaceId)
  const [workspacesMenuAnchor, setWorkspacesMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [viewOptionsAnchor, setViewOptionsAnchor] = useState<{ x: number; y: number } | null>(null)
  const [showSaveWorkspaceModal, setShowSaveWorkspaceModal] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [activeDropZone, setActiveDropZone] = useState<'sidebar' | 'bottom' | null>(null)

  // Bottom Stage Bar states (unified professional dock)
  const [bottomBarHeight, setBottomBarHeight] = useState<number>(() => {
    try {
      const saved = getReviewStorage('bottom_height')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (parsed >= 100 && parsed <= 420) return parsed
      }
    } catch {}
    return 160
  })
  // Horizontal split: width of the modules pane when side-by-side with the filmstrip
  const [bottomSplitWidth, setBottomSplitWidth] = useState<number>(() => {
    try {
      const saved = getReviewStorage('bottom_split_width')
      if (saved) {
        const parsed = parseInt(saved, 10)
        const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 300 : 1200
        if (parsed >= 240 && parsed <= maxWidth) return parsed
      }
    } catch {}
    return 420
  })
  // Dock order: which pane sits on the left of the unified bottom dock
  const [bottomDockSwap, setBottomDockSwap] = useState<'modules-left' | 'filmstrip-left'>(() => {
    try {
      const saved = getReviewStorage('bottom_dock_swap')
      if (saved === 'filmstrip-left' || saved === 'modules-left') return saved
    } catch {}
    return 'modules-left'
  })
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false)
  const [showBottomMenu, setShowBottomMenu] = useState(false)

  // Flyout / Pop-Out Panel Overlay (When collapsed to icons)
  const [activeFlyoutModule, setActiveFlyoutModule] = useState<string | null>(null)

  // Modifier keys tracking (Cmd / Ctrl suppresses drop docking)
  const [isModifierHeld, setIsModifierHeld] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setIsModifierHeld(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setIsModifierHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Close the workspaces menu on Escape (capture phase so global shortcuts don't fire first)
  useEffect(() => {
    if (!workspacesMenuAnchor) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setWorkspacesMenuAnchor(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [workspacesMenuAnchor])

  // Close the View Options popover on Escape (capture phase so global shortcuts don't fire first)
  useEffect(() => {
    if (!viewOptionsAnchor) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setViewOptionsAnchor(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [viewOptionsAnchor])

  const handleSelectBottomTab = useCallback((groupId: string, tabId: string) => {
    setBottomGroups(prev => {
      const next = prev.map(g => g.id === groupId ? { ...g, activeTab: tabId } : g)
      setReviewStorage('bottom_groups', JSON.stringify(next))
      return next
    })
    setIsBottomCollapsed(false)
  }, [])

  const handleSplitBottomGroup = useCallback((groupIndex: number, tabId: string, side: 'left' | 'right') => {
    setBottomGroups(prev => {
      const pruned = prev.map(g => {
        const rem = g.tabs.filter(t => t !== tabId)
        return { ...g, tabs: rem, activeTab: g.activeTab === tabId ? rem[0] || '' : g.activeTab }
      }).filter(g => g.tabs.length > 0)

      const newGroup: BottomGroup = {
        id: `bottom-group-${tabId}-${Date.now()}`,
        tabs: [tabId],
        activeTab: tabId,
        widthRatio: 1,
      }

      const insertIdx = side === 'left' ? Math.max(0, groupIndex) : Math.min(pruned.length, groupIndex + 1)
      pruned.splice(insertIdx, 0, newGroup)
      setReviewStorage('bottom_groups', JSON.stringify(pruned))
      return pruned
    })
    toast.success(`Split ${MODULE_TITLES[tabId] || tabId} into side-by-side pane`)
  }, [])

  const handleMergeBottomGroups = useCallback(() => {
    setBottomGroups(prev => {
      if (prev.length <= 1) return prev
      const allTabs = Array.from(new Set(prev.flatMap(g => g.tabs)))
      const merged: BottomGroup[] = [{
        id: `bottom-group-merged-${Date.now()}`,
        tabs: allTabs,
        activeTab: allTabs[0] || 'people',
        widthRatio: 1,
      }]
      setReviewStorage('bottom_groups', JSON.stringify(merged))
      return merged
    })
    toast.success('Merged all bottom panels into a single tab group')
  }, [])

  const startHorizontalResize = useCallback((splitterIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const leftGroup = bottomGroups[splitterIndex - 1]
    const rightGroup = bottomGroups[splitterIndex]
    if (!leftGroup || !rightGroup) return

    const initialLeftRatio = leftGroup.widthRatio || 1
    const initialRightRatio = rightGroup.widthRatio || 1

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX
      const containerEl = document.getElementById('bottom-groups-container')
      const totalWidth = containerEl?.getBoundingClientRect().width || 1000
      const totalRatio = bottomGroups.reduce((acc, g) => acc + (g.widthRatio || 1), 0)
      const deltaRatio = (deltaX / totalWidth) * totalRatio

      const newLeftRatio = Math.max(0.25, initialLeftRatio + deltaRatio)
      const newRightRatio = Math.max(0.25, initialRightRatio - deltaRatio)

      setBottomGroups(prev => prev.map((g, idx) => {
        if (idx === splitterIndex - 1) return { ...g, widthRatio: newLeftRatio }
        if (idx === splitterIndex) return { ...g, widthRatio: newRightRatio }
        return g
      }))
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      setBottomGroups(current => {
        setReviewStorage('bottom_groups', JSON.stringify(current))
        return current
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [bottomGroups])

  const handleExecuteBottomDrop = useCallback((tabId: string, sourceGroupId: string, target: DropTarget) => {
    if (target.type === 'bottom-split') {
      handleSplitBottomGroup(target.groupIndex, tabId, target.side)
    } else if (target.type === 'bottom-tab-group') {
      if (target.groupId !== sourceGroupId) {
        setBottomGroups(prev => {
          const pruned = prev.map(g => {
            if (g.id === sourceGroupId) {
              const rem = g.tabs.filter(t => t !== tabId)
              return { ...g, tabs: rem, activeTab: g.activeTab === tabId ? rem[0] || '' : g.activeTab }
            }
            if (g.id === target.groupId) {
              const newTabs = g.tabs.includes(tabId) ? g.tabs : [...g.tabs, tabId]
              return { ...g, tabs: newTabs, activeTab: tabId }
            }
            return g
          }).filter(g => g.tabs.length > 0)
          setReviewStorage('bottom_groups', JSON.stringify(pruned))
          return pruned
        })
        toast.success(`Moved ${MODULE_TITLES[tabId] || tabId} into group`)
      }
    } else if (target.type === 'sidebar-dock' || target.type === 'side-dock' || target.type === 'split-line' || target.type === 'tab-group') {
      setModulePlacement(tabId, 'sidebar')
    } else if (target.type === 'canvas') {
      setModulePlacement(tabId, 'floating', {
        x: Math.max(40, target.x - 120),
        y: Math.max(60, target.y - 40),
      })
      toast.success(`Detached ${MODULE_TITLES[tabId] || tabId} into floating window`)
    }
  }, [handleSplitBottomGroup, setModulePlacement])

  const handleBottomTabPointerDown = useCallback((tabId: string, sourceGroupId: string, e: React.PointerEvent) => {
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
            sourceZone: 'bottom',
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
          handleExecuteBottomDrop(tabId, sourceGroupId, drop.dropTarget)
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [handleExecuteBottomDrop])

  // Dragging the docked Filmstrip grip tears off into a floating window.
  // The drag stays alive until pointer release: a ghost tracks the cursor
  // 1:1 the whole way, and the floating panel lands at the release point.
  const handleFilmstripStartDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let hasStartedDrag = false
    try {
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch {}

    const placeFloatingAt = (clientX: number, clientY: number) => {
      const x = Math.max(10, Math.min(window.innerWidth - 340, clientX - 300))
      const y = Math.max(10, Math.min(window.innerHeight - 170, clientY - 20))
      try {
        const serialized = JSON.stringify({ x, y })
        localStorage.setItem('firstpass_filmstrip_panel_pos', serialized)
        localStorage.setItem('photo_culler_filmstrip_panel_pos', serialized)
      } catch {}
    }

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!hasStartedDrag && Math.hypot(dx, dy) > 8) {
        hasStartedDrag = true
        dockDragManager.startDrag(
          {
            type: 'module-tab',
            id: 'filmstrip',
            title: 'Filmstrip',
            sourceZone: 'bottom',
          },
          ev.clientX,
          ev.clientY
        )
      }
      if (hasStartedDrag) {
        // Keep the ghost tracking the pointer until release (never abort).
        dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey)
      }
    }

    const handlePointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      if (!hasStartedDrag) return
      const drop = dockDragManager.endDrag()
      const target = drop?.dropTarget
      if (target && (target.type === 'sidebar-dock' || target.type === 'side-dock')) {
        setFilmstripPosition('side')
      } else if (
        target &&
        (target.type === 'bottom-dock' || target.type === 'bottom-split' || target.type === 'bottom-tab-group')
      ) {
        // Dropped back over the bottom dock: stay docked.
      } else {
        // Float at the release point so the panel lands under the cursor.
        placeFloatingAt(ev.clientX, ev.clientY)
        setFilmstripPosition('floating')
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [setFilmstripPosition])

  useEffect(() => {
    const handleSplitEvent = (e: any) => {
      const { tabId, groupIndex, side } = e.detail || {}
      if (tabId) {
        setModulePlacement(tabId, 'bottom')
        setTimeout(() => handleSplitBottomGroup(groupIndex ?? 0, tabId, side || 'right'), 50)
      }
    }
    window.addEventListener('app:dock-bottom-split', handleSplitEvent)
    return () => window.removeEventListener('app:dock-bottom-split', handleSplitEvent)
  }, [handleSplitBottomGroup, setModulePlacement])

  useEffect(() => {
    const handleDockHover = (e: any) => {
      setActiveDropZone(e.detail?.zone || null)
    }
    window.addEventListener('app:dock-hover', handleDockHover)
    return () => window.removeEventListener('app:dock-hover', handleDockHover)
  }, [])

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || PRESET_WORKSPACES[0]
  const customWorkspaces = workspaces.filter(w => !w.isPreset)

  // Workspaces govern item locations, geometry, and layout ONLY — panel
  // placements, dock sizes, sidebar widths. They never touch theme colors or
  // the canvas backdrop (those belong to Studio Themes).
  const applyWorkspace = useCallback((workspace: WorkspaceLayout) => {
    setScorePanelDock(workspace.scorePanelDock)
    setScorePanelWidth(workspace.scorePanelWidth)
    setFaceLoupeModeAndStore(workspace.faceLoupeMode)
    setHistogramModeAndStore(workspace.histogramMode)
    setFilmstripPosition(workspace.filmstripPosition)
    setHudMode(workspace.hudMode)
    try {
      if (workspace.hudPosition) {
        setReviewStorage('hud_pos', JSON.stringify(workspace.hudPosition))
      }
      if (workspace.modulesOrder && workspace.modulesOrder.length > 0) {
        setReviewStorage('inspector_order', JSON.stringify(workspace.modulesOrder))
      }
      if (workspace.modulePlacements) {
        setModulePlacements(workspace.modulePlacements)
        setReviewStorage('module_placements', JSON.stringify(workspace.modulePlacements))
      }
    } catch {}
    setActiveWorkspaceId(workspace.id)
    setActiveWorkspaceIdState(workspace.id)
    toast.success(`Switched to "${workspace.name}" layout`, { icon: '📐' })
  }, [setScorePanelDock, setFaceLoupeModeAndStore, setHistogramModeAndStore, setFilmstripPosition])

  const handleSaveCurrentWorkspace = useCallback(() => {
    if (!newWorkspaceName.trim()) {
      toast.error('Please enter a workspace name')
      return
    }

    let hudPosition = { x: 20, y: 20 }
    try {
      const savedPos = getReviewStorage('hud_pos')
      if (savedPos) hudPosition = JSON.parse(savedPos)
    } catch {}

    let modulesOrder = ['histogram', 'overall', 'reasons', 'quality', 'people', 'context', 'camera', 'file']
    try {
      const savedOrder = getReviewStorage('inspector_order')
      if (savedOrder) modulesOrder = JSON.parse(savedOrder)
    } catch {}

    // Layout-only snapshot: workspaces never capture theme or canvas backdrop.
    const saved = saveCustomWorkspace(newWorkspaceName.trim(), {
      scorePanelDock,
      scorePanelWidth,
      faceLoupeMode,
      histogramMode,
      filmstripPosition,
      hudMode,
      hudPosition,
      modulesOrder,
      modulePlacements
    })

    const updated = getAllWorkspaces()
    setWorkspaces(updated)
    setActiveWorkspaceId(saved.id)
    setActiveWorkspaceIdState(saved.id)
    setShowSaveWorkspaceModal(false)
    setNewWorkspaceName('')
    toast.success(`Saved custom workspace "${saved.name}"!`)
  }, [newWorkspaceName, scorePanelDock, scorePanelWidth, faceLoupeMode, histogramMode, filmstripPosition, hudMode, modulePlacements])

  const handleDeleteCustomWorkspace = useCallback((id: string) => {
    deleteCustomWorkspace(id)
    const updated = getAllWorkspaces()
    setWorkspaces(updated)
    if (activeWorkspaceId === id) {
      applyWorkspace(PRESET_WORKSPACES[0])
    }
    toast('Workspace removed', { icon: '🗑️' })
  }, [activeWorkspaceId, applyWorkspace])

  // Remember the last visible filmstrip placement so show/hide restores it
  const lastFilmstripRef = useRef(filmstripPosition)
  useEffect(() => {
    if (filmstripPosition !== 'hidden') lastFilmstripRef.current = filmstripPosition
  }, [filmstripPosition])

  // Adobe-style per-panel show/hide. Toggles visibility in real time without
  // touching layout geometry, theme colors, or the canvas backdrop.
  const togglePanelVisibility = useCallback((key: PanelKey) => {
    switch (key) {
      case 'filmstrip':
        setFilmstripPosition(filmstripPosition === 'hidden' ? lastFilmstripRef.current : 'hidden')
        break
      case 'cullingBar':
        setShowCullingBarAndStore(!showCullingBar)
        break
      case 'inspector':
        toggleScorePanel()
        break
      case 'hud': {
        const next = (hudMode > 0 ? 0 : 1) as HudMode
        setHudMode(next)
        setReviewStorage('hud_mode', String(next))
        break
      }
      case 'histogram':
        setHistogramModeAndStore(histogramMode === 'hidden' ? 'sidebar' : 'hidden')
        break
      case 'faceLoupe':
        setFaceLoupeModeAndStore(faceLoupeMode === 'hidden' ? 'bottom' : 'hidden')
        break
      case 'bottomDock':
        setIsBottomCollapsed(prev => !prev)
        break
      case 'quality':
      case 'camera':
      case 'reasons': {
        const moduleId = key
        setModulePlacement(moduleId, modulePlacements[moduleId] === 'hidden' ? 'sidebar' : 'hidden')
        break
      }
    }
  }, [filmstripPosition, setFilmstripPosition, showCullingBar, setShowCullingBarAndStore, toggleScorePanel, hudMode, histogramMode, setHistogramModeAndStore, faceLoupeMode, setFaceLoupeModeAndStore, modulePlacements, setModulePlacement])

  const showAllPanels = useCallback(() => {
    if (filmstripPosition === 'hidden') setFilmstripPosition(lastFilmstripRef.current)
    if (!showCullingBar) setShowCullingBarAndStore(true)
    if (scorePanelDock === 'collapsed') setScorePanelDock(lastActiveDockRef.current || 'right')
    if (hudMode === 0) {
      setHudMode(1)
      setReviewStorage('hud_mode', '1')
    }
    if (histogramMode === 'hidden') setHistogramModeAndStore('sidebar')
    if (faceLoupeMode === 'hidden') setFaceLoupeModeAndStore('bottom')
    setIsBottomCollapsed(false)
    ;(['quality', 'camera', 'reasons'] as const).forEach((moduleId) => {
      if (modulePlacements[moduleId] === 'hidden') setModulePlacement(moduleId, 'sidebar')
    })
    toast.success('All panels shown', { id: 'panels-toast' })
  }, [filmstripPosition, setFilmstripPosition, showCullingBar, setShowCullingBarAndStore, scorePanelDock, setScorePanelDock, hudMode, histogramMode, setHistogramModeAndStore, faceLoupeMode, setFaceLoupeModeAndStore, modulePlacements, setModulePlacement])

  const resetDefaultPanels = useCallback(() => {
    setFilmstripPosition('bottom')
    setShowCullingBarAndStore(true)
    setScorePanelDock('right')
    setHudMode(1)
    setReviewStorage('hud_mode', '1')
    setHistogramModeAndStore('sidebar')
    setFaceLoupeModeAndStore('bottom')
    setIsBottomCollapsed(false)
    ;(['quality', 'camera', 'reasons'] as const).forEach((moduleId) => {
      setModulePlacement(moduleId, DEFAULT_MODULE_PLACEMENTS[moduleId] || 'sidebar')
    })
    toast.success('Panels reset to default', { id: 'panels-toast' })
  }, [setFilmstripPosition, setShowCullingBarAndStore, setScorePanelDock, setHistogramModeAndStore, setFaceLoupeModeAndStore, setModulePlacement])

  const panelSelectorItems = [
    { key: 'filmstrip' as PanelKey, label: 'Filmstrip', description: filmstripPosition === 'hidden' ? 'Hidden' : `Docked: ${filmstripPosition}`, visible: filmstripPosition !== 'hidden' },
    { key: 'cullingBar' as PanelKey, label: 'Culling Action Bar', description: 'Accept / reject / tag controls', visible: showCullingBar },
    { key: 'inspector' as PanelKey, label: 'Inspector Sidebar', description: scorePanelDock === 'collapsed' ? 'Collapsed' : `Docked: ${scorePanelDock}`, visible: scorePanelDock !== 'collapsed' },
    { key: 'hud' as PanelKey, label: 'Photographic Info HUD', description: hudMode === 0 ? 'Off' : hudMode === 1 ? 'Triage summary' : 'Shooting EXIF', visible: hudMode > 0 },
    { key: 'histogram' as PanelKey, label: 'RGB & Luminance Histogram', description: histogramMode === 'hidden' ? 'Hidden' : `Docked: ${histogramMode}`, visible: histogramMode !== 'hidden' },
    { key: 'faceLoupe' as PanelKey, label: 'Face Loupe', description: faceLoupeMode === 'hidden' ? 'Hidden' : `Docked: ${faceLoupeMode}`, visible: faceLoupeMode !== 'hidden' },
    { key: 'bottomDock' as PanelKey, label: 'Bottom Dock', description: isBottomCollapsed ? 'Collapsed' : 'Expanded', visible: !isBottomCollapsed },
    { key: 'quality' as PanelKey, label: 'Quality Metrics Module', description: `Placement: ${modulePlacements.quality || 'sidebar'}`, visible: modulePlacements.quality !== 'hidden' },
    { key: 'camera' as PanelKey, label: 'Camera EXIF Module', description: `Placement: ${modulePlacements.camera || 'sidebar'}`, visible: modulePlacements.camera !== 'hidden' },
    { key: 'reasons' as PanelKey, label: 'AI Reasons Module', description: `Placement: ${modulePlacements.reasons || 'sidebar'}`, visible: modulePlacements.reasons !== 'hidden' },
  ]

  // Drag-to-resize sidebar handlers (with multi-state snapping)
  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = scorePanelWidth
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      const rawWidth = startWidth + delta
      if (rawWidth < 120) {
        setScorePanelDock('collapsed')
        return
      }
      if (scorePanelDock === 'collapsed') {
        setScorePanelDock('right')
      }
      const newWidth = Math.max(200, Math.min(550, rawWidth))
      setScorePanelWidth(newWidth)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setScorePanelWidth(w => {
        setReviewStorage('score_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = scorePanelWidth
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const rawWidth = startWidth + delta
      if (rawWidth < 120) {
        setScorePanelDock('collapsed')
        return
      }
      if (scorePanelDock === 'collapsed') {
        setScorePanelDock('left')
      }
      const newWidth = Math.max(200, Math.min(550, rawWidth))
      setScorePanelWidth(newWidth)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setScorePanelWidth(w => {
        setReviewStorage('score_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startResizeBottom = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = bottomBarHeight
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      const newHeight = Math.max(100, Math.min(420, startHeight + delta))
      setBottomBarHeight(newHeight)
      if (isBottomCollapsed && delta > 20) {
        setIsBottomCollapsed(false)
      }
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setBottomBarHeight(h => {
        setReviewStorage('bottom_height', String(h))
        return h
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Left/right splitter between the modules pane and the filmstrip pane.
  const bottomSplitWidthRef = useRef(bottomSplitWidth)
  bottomSplitWidthRef.current = bottomSplitWidth
  const bottomDockSwapRef = useRef(bottomDockSwap)
  bottomDockSwapRef.current = bottomDockSwap

  const startBottomHorizontalSplitResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = bottomSplitWidthRef.current
    const swapAtStart = bottomDockSwapRef.current
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const deltaX = swapAtStart === 'modules-left' ? ev.clientX - startX : startX - ev.clientX
      const maxWidth = window.innerWidth - 300
      const newWidth = Math.max(240, Math.min(maxWidth, startWidth + deltaX))
      setBottomSplitWidth(newWidth)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setBottomSplitWidth(w => {
        setReviewStorage('bottom_split_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleToggleBottomDockSwap = useCallback(() => {
    setBottomDockSwap(prev => {
      const next = prev === 'modules-left' ? 'filmstrip-left' : 'modules-left'
      setReviewStorage('bottom_dock_swap', next)
      return next
    })
  }, [])

  const handleResetBottomSplitWidth = useCallback(() => {
    setBottomSplitWidth(420)
    setReviewStorage('bottom_split_width', String(420))
  }, [])

  useEffect(() => {
    if (photoId) {
      setLastReviewedPhotoId(photoId)
      setActivePhotoId(photoId)
    }
  }, [photoId])

  const handleReanalyze = async () => {
    if (!photo || isReanalyzing) return
    setIsReanalyzing(true)
    try {
      const updated = await api.reanalyzePhoto(photo.id)
      setPhoto(updated)
      updatePhotoStatusLocal(photo.id, updated.status)
      toast.success('Re-analyzed! Scores updated.')
    } catch (e: any) {
      toast.error('Re-analysis failed')
    } finally {
      setIsReanalyzing(false)
    }
  }

  // Sync photo status and tag if store updates (e.g. via undo/redo or hotkey)
  useEffect(() => {
    if (photo) {
      const matched = photos.find(p => p.id === photo.id)
      if (matched && (matched.status !== photo.status || matched.is_tagged !== photo.is_tagged)) {
        setPhoto(prev => prev ? { ...prev, status: matched.status, is_tagged: matched.is_tagged } : null)
      }
    }
  }, [photos, photo?.id])

  const currentIndex = photos.findIndex(p => p.id === photoId)
  const prevPhoto = currentIndex > 0 ? photos[currentIndex - 1] : null
  const nextPhoto = currentIndex < photos.length - 1 ? photos[currentIndex + 1] : null

  const handleOpenCompare = useCallback(() => {
    if (!photo) return
    const otherPhoto = prevPhoto || nextPhoto
    if (otherPhoto) {
      navigate(`/compare?ids=${otherPhoto.id},${photo.id}&returnTo=/review/${photo.id}`)
    } else {
      navigate(`/compare?ids=${photo.id}&returnTo=/review/${photo.id}`)
    }
  }, [photo, prevPhoto, nextPhoto, navigate])

  useEffect(() => {
    const cached = usePhotosStore.getState().photos.find(p => p.id === photoId)
    if (cached) {
      setPhoto(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const fullUrl = api.getFullImageUrl(photoId)
    setFullLoaded(isImageDecoded(fullUrl))
    preloadAndDecodeImage(fullUrl).then(ok => { if (ok) setFullLoaded(true) })

    setZoomLevel(1)
    setZoomOrigin({ x: 50, y: 50 })
    setIsHoldingZoom(false)
    isMouseDownRef.current = false
    setZoomedFace(null)

    let cancelled = false
    api.getPhoto(photoId)
      .then(p => {
        if (cancelled) return
        setPhoto(prev => {
          if (!prev || prev.id !== p.id) return p
          const storePhoto = usePhotosStore.getState().photos.find(item => item.id === p.id)
          return {
            ...p,
            status: storePhoto?.status ?? prev.status ?? p.status,
            is_tagged: storePhoto?.is_tagged ?? prev.is_tagged ?? p.is_tagged,
          }
        })
        if (p.duplicate_group_id) {
          api.getDuplicateGroups().then((groups: DuplicateGroup[]) => {
            if (cancelled) return
            const grp = groups.find(g => g.group_id === p.duplicate_group_id)
            if (grp) setDuplicateGroup(grp.photos)
          }).catch(() => {})
        } else {
          setDuplicateGroup([])
        }
      })
      .catch(() => {
        if (!cached) toast.error('Could not load photo')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [photoId])

  // Background GPU pre-decoding of adjacent images for instant culling
  useEffect(() => {
    preloadAdjacentPhotos(photos, currentIndex, api.getFullImageUrl, api.getThumbnailUrl, 6, 2)
  }, [currentIndex, photos])

  const handleSelectFace = useCallback((box: [number, number, number, number], faceIndex?: number, isVip?: boolean) => {
    if (!photo || !photo.width || !photo.height) return
    const [bx, by, bw, bh] = box
    const cx = Math.max(5, Math.min(95, ((bx + bw / 2) / photo.width) * 100))
    const cy = Math.max(5, Math.min(95, ((by + bh / 2) / photo.height) * 100))
    setZoomOrigin({ x: cx, y: cy })
    setZoomLevel(3)
    if (faceIndex !== undefined) {
      setZoomedFace({ index: faceIndex, isVip: Boolean(isVip) })
    } else {
      setZoomedFace(null)
    }
  }, [photo])

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1)
    setZoomOrigin({ x: 50, y: 50 })
    setIsHoldingZoom(false)
    isMouseDownRef.current = false
    setZoomedFace(null)
  }, [])

  const handleToggleZoom = useCallback(() => {
    if (zoomLevel > 1) {
      setZoomLevel(1)
      setZoomOrigin({ x: 50, y: 50 })
      setIsHoldingZoom(false)
      setZoomedFace(null)
    } else {
      setZoomLevel(2.5)
      setZoomOrigin({ x: 50, y: 50 })
      setZoomedFace(null)
    }
  }, [zoomLevel])

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (e.button !== 0) return // Left click only
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setZoomOrigin({ x, y })
    isMouseDownRef.current = true

    if (zoomLevel === 1) {
      setZoomLevel(2.5)
      setIsHoldingZoom(true)
      setZoomedFace(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isMouseDownRef.current || !isHoldingZoom) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setZoomOrigin({ x, y })
  }

  const handleMouseUp = () => {
    if (isHoldingZoom) {
      setZoomLevel(1)
      setZoomOrigin({ x: 50, y: 50 })
      setIsHoldingZoom(false)
      setZoomedFace(null)
    }
    isMouseDownRef.current = false
  }

  const handleStatus = useCallback(async (status: 'accepted' | 'rejected' | 'pending') => {
    if (!photo) return
    const currentPhotoId = photo.id
    setPhoto(prev => (prev && prev.id === currentPhotoId ? { ...prev, status } : prev))
    const statusPromise = setPhotoStatusWithUndo(currentPhotoId, status)
    if (status !== 'pending' && nextPhoto && autoAdvance) {
      navigate(`/review/${nextPhoto.id}`)
    }
    await statusPromise
  }, [photo, nextPhoto, autoAdvance, setPhotoStatusWithUndo, navigate])

  const handleSkip = useCallback(async () => {
    if (!photo) return
    const currentPhotoId = photo.id
    if (photo.status !== 'pending') {
      setPhoto(prev => (prev && prev.id === currentPhotoId ? { ...prev, status: 'pending' } : prev))
      await setPhotoStatusWithUndo(currentPhotoId, 'pending')
    }
    if (nextPhoto) {
      navigate(`/review/${nextPhoto.id}`)
    } else {
      toast('At last photo', { icon: '🏁', id: 'last-photo' })
    }
  }, [photo, nextPhoto, setPhotoStatusWithUndo, navigate])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

    // Undo / Redo
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
      return
    }

    if (!photo) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        handleSkip()
        break
      case 'CapsLock':
        e.preventDefault()
        toggleAutoAdvance()
        break
      case '\\': case 't': case 'T':
        e.preventDefault()
        togglePhotoTag(photo.id)
        break
      case 'b': case 'B':
        e.preventDefault()
        setFilmstripPosition(filmstripPosition === 'hidden' ? 'bottom' : 'hidden')
        break
      case '`': case '~': case '1': case 'a': case 'A': case 'p': case 'P':
        e.preventDefault()
        handleStatus('accepted')
        break
      case '2': case 'r': case 'R': case 'x': case 'X':
        e.preventDefault()
        handleStatus('rejected')
        break
      case '0': case 'u': case 'U':
        e.preventDefault()
        handleStatus('pending')
        break
      case 'ArrowRight':
        e.preventDefault()
        if (nextPhoto) navigate(`/review/${nextPhoto.id}`)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (prevPhoto) navigate(`/review/${prevPhoto.id}`)
        break
      case 'Escape':
        if (lightsOutLevel > 0) {
          setLightsOutLevel(0)
        } else if (zoomLevel > 1) {
          setZoomLevel(1)
          setZoomOrigin({ x: 50, y: 50 })
          setIsHoldingZoom(false)
        } else {
          navigate('/')
        }
        break
      case 'l': case 'L':
        e.preventDefault()
        cycleLightsOut()
        break
      case 'i': case 'I':
        e.preventDefault()
        cycleHud()
        break
      case 'z': case 'Z':
        e.preventDefault()
        handleToggleZoom()
        break
      case 'e': case 'E':
        e.preventDefault()
        setShowClipping(prev => {
          const next = !prev
          toast(next ? 'Exposure Clipping (Blinkies) ON' : 'Clipping overlay OFF', { id: 'clipping-toast', icon: '☀️' })
          return next
        })
        break
      case 'h': case 'H':
        e.preventDefault()
        cycleHistogram()
        break
      case 'Tab':
        e.preventDefault()
        toggleScorePanel()
        break
      case 'c': case 'C':
        e.preventDefault()
        handleOpenCompare()
        break
      case 'f': case 'F':
        e.preventDefault()
        setFullscreen(prev => !prev)
        break
    }
  }, [photo, nextPhoto, prevPhoto, zoomLevel, handleToggleZoom, undo, redo, navigate, autoAdvance, toggleAutoAdvance, filmstripPosition, setFilmstripPosition, togglePhotoTag, handleOpenCompare, toggleScorePanel, lightsOutLevel, cycleLightsOut, cycleHud, cycleHistogram, handleSkip, handleStatus])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Listen for native Application Menu actions targeted at Review
  useEffect(() => {
    const handleAppMenuAction = (e: Event) => {
      const { action, payload } = (e as CustomEvent).detail || {}
      switch (action) {
        case 'set-lights-out':
          if (typeof payload === 'number') setLightsOutLevel(payload as 0 | 1 | 2)
          break
        case 'cycle-lights-out':
          cycleLightsOut()
          break
        case 'set-hud':
          if (typeof payload === 'number') {
            setHudMode(payload as HudMode)
            setReviewStorage('hud_mode', String(payload))
          }
          break
        case 'cycle-hud':
          cycleHud()
          break
        case 'toggle-hud':
          cycleHud()
          break
        case 'close-hud':
          setHudMode(0)
          setReviewStorage('hud_mode', '0')
          break
        case 'next-photo':
          if (nextPhoto) navigate(`/review/${nextPhoto.id}`)
          break
        case 'prev-photo':
          if (prevPhoto) navigate(`/review/${prevPhoto.id}`)
          break
        case 'first-photo':
          if (photos.length > 0) navigate(`/review/${photos[0].id}`)
          break
        case 'last-photo':
          if (photos.length > 0) navigate(`/review/${photos[photos.length - 1].id}`)
          break
        case 'zoom-in':
          setZoomLevel(prev => Math.min(3, prev + 0.5))
          break
        case 'zoom-out':
          setZoomLevel(prev => Math.max(1, prev - 0.5))
          break
        case 'zoom-100':
          setZoomLevel(1)
          break
        case 'zoom-200':
          setZoomLevel(2)
          break
        case 'toggle-fullscreen':
          setFullscreen(prev => !prev)
          break
        case 'toggle-bottom-dock':
          setIsBottomCollapsed(prev => !prev)
          break
        case 'toggle-bottom-split':
          handleToggleBottomDockSwap()
          break
        case 'reset-bottom-split':
          handleResetBottomSplitWidth()
          break
        case 'set-triage':
          if (payload === 'bottom' || payload === 'floating') setTriagePlacement(payload)
          break
        case 'center-culling-bar': {
          if (triagePlacement !== 'floating') setTriagePlacement('floating')
          const cx = Math.round(window.innerWidth / 2 - 180)
          const cy = Math.round(window.innerHeight / 2 - 40)
          setReviewStorage('triage_hud_pos', JSON.stringify({ x: cx, y: cy }))
          window.dispatchEvent(new CustomEvent('triage:center', { detail: { x: cx, y: cy } }))
          break
        }
        case 'set-backdrop':
          if (payload) setCanvasBackdrop(payload as CanvasBackdropMode)
          break
        case 'toggle-clipping':
          setShowClipping(prev => {
            const next = !prev
            toast(next ? 'Exposure Clipping (Blinkies) ON' : 'Clipping overlay OFF', { id: 'clipping-toast', icon: '☀️' })
            return next
          })
          break
        case 'toggle-histogram':
          cycleHistogram()
          break
        case 'set-histogram':
          if (payload) setHistogramModeAndStore(payload as HistogramMode)
          break
        case 'set-faceloupe':
          if (payload) setFaceLoupeModeAndStore(payload as any)
          break
        case 'set-workspace':
          if (payload) {
            const found = workspaces.find(w => w.id === payload)
            if (found) applyWorkspace(found)
          }
          break
        case 'reset-workspace':
          applyWorkspace(resetWorkspace(activeWorkspaceId))
          break
        case 'save-workspace-dialog':
          setShowSaveWorkspaceModal(true)
          break
        case 'toggle-inspector':
          toggleScorePanel()
          break
        case 'open-panel-selector':
          setShowPanelSelector(true)
          break
        case 'toggle-filmstrip-visibility':
          togglePanelVisibility('filmstrip')
          break
        case 'toggle-culling-bar':
          togglePanelVisibility('cullingBar')
          break
        case 'toggle-hud-visibility':
          togglePanelVisibility('hud')
          break
        case 'toggle-histogram-visibility':
          togglePanelVisibility('histogram')
          break
        case 'toggle-faceloupe-visibility':
          togglePanelVisibility('faceLoupe')
          break
        case 'set-filmstrip':
          if (payload) setFilmstripPosition(payload)
          break
        case 'toggle-filmstrip':
          setFilmstripPosition(filmstripPosition === 'hidden' ? 'bottom' : filmstripPosition === 'bottom' ? 'side' : filmstripPosition === 'side' ? 'floating' : 'hidden')
          break
        case 'reanalyze-active':
          handleReanalyze()
          break
        case 'rate-accept':
          handleStatus('accepted')
          break
        case 'rate-reject':
          handleStatus('rejected')
          break
        case 'rate-pending':
          handleStatus('pending')
          break
        case 'rate-skip':
          handleSkip()
          break
        case 'toggle-tag':
          if (photo) togglePhotoTag(photo.id)
          break
        case 'toggle-zoom':
          handleToggleZoom()
          break
        case 'zoom-fit':
          if (lightsOutLevel > 0) {
            setLightsOutLevel(0)
          } else {
            setZoomLevel(1)
            setZoomOrigin({ x: 50, y: 50 })
            setIsHoldingZoom(false)
          }
          break
        case 'open-export':
        case 'quick-export':
          window.dispatchEvent(
            new CustomEvent('app:open-export', {
              detail: {
                selectedIds: photo ? [photo.id] : [],
                initialScope: 'accepted'
              }
            })
          )
          break
        case 'export-tagged':
          window.dispatchEvent(
            new CustomEvent('app:open-export', {
              detail: {
                selectedIds: photo ? [photo.id] : [],
                initialScope: 'tagged'
              }
            })
          )
          break
      }
    }

    window.addEventListener('app:menu-action', handleAppMenuAction)
    return () => window.removeEventListener('app:menu-action', handleAppMenuAction)
  }, [cycleLightsOut, cycleHud, setCanvasBackdrop, toggleScorePanel, filmstripPosition, setFilmstripPosition, handleReanalyze, handleStatus, handleSkip, photo, togglePhotoTag, handleToggleZoom, lightsOutLevel, cycleHistogram, setHistogramModeAndStore, workspaces, applyWorkspace, navigate, nextPhoto, prevPhoto, photos, triagePlacement, handleToggleBottomDockSwap, handleResetBottomSplitWidth, togglePanelVisibility])

  // Sync menu state with Review tool settings
  useEffect(() => {
    window.electronAPI?.updateMenuState?.({
      lightsOutLevel,
      hudMode,
      canvasBackdrop,
      showClipping,
      showHistogram: histogramMode !== 'hidden',
      histogramMode,
      faceLoupeMode,
      inspectorOpen: scorePanelDock !== 'collapsed',
      filmstripPosition,
      showCullingBar,
      isBottomCollapsed,
      activeWorkspace: activeWorkspaceId
    })
  }, [lightsOutLevel, hudMode, canvasBackdrop, showClipping, histogramMode, faceLoupeMode, scorePanelDock, filmstripPosition, showCullingBar, isBottomCollapsed, activeWorkspaceId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <FirstPassLoader size="md" label="Loading photograph..." />
      </div>
    )
  }

  if (!photo) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-neutral-400">
        <p>Photo not found</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400 hover:underline">
          Back to Gallery
        </button>
      </div>
    )
  }

  const statusColors = {
    accepted: 'border-green-500',
    rejected: 'border-red-500',
    pending: 'border-transparent',
  }

  // Unified bottom bar: docked modules + filmstrip render side-by-side
  const showBottomModules = bottomGroups.length > 0 && allBottomTabs.length > 0
  const showBottomFilmstrip = filmstripPosition === 'bottom' && !fullscreen
  const isBottomSideBySide = showBottomModules && showBottomFilmstrip

  return (
    <div className={clsx('flex flex-col h-full bg-black relative overflow-hidden', fullscreen && 'fixed inset-0 z-50')}>
      {/* Universal 60fps Drag Ghost Overlay & Snap Lines */}
      <DragGhostOverlay />

      {/* ── Full-width Top Bar (spans the window above the docks; can never bleed over ScorePanel) ── */}
      <div className={clsx(
        "flex items-center justify-between gap-1.5 md:gap-2 px-3 py-1.5 bg-neutral-950 border-b border-neutral-800 shrink-0 select-none overflow-hidden min-w-0 z-30 transition-opacity duration-300",
        lightsOutLevel === 1 && "lights-out-dim",
        lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
      )}>
        {/* LEFT ZONE: Document & Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-neutral-300 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700/60 text-xs font-medium shrink-0"
            title="Back to Gallery (Esc)"
          >
            <ArrowLeft size={13} />
            <span className="hidden xl:inline">Gallery</span>
          </button>

          <div className="w-px h-5 bg-neutral-700/60 shrink-0" />

          {/* Filename, status & counter */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-white text-xs font-semibold truncate max-w-[70px] sm:max-w-[90px] md:max-w-[120px] lg:max-w-[160px] xl:max-w-[200px]" title={photo.filename}>
              {photo.filename}
            </span>
            <span
              className={clsx(
                'shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border',
                photo.status === 'accepted' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50',
                photo.status === 'rejected' && 'bg-rose-500/15 text-rose-300 border-rose-500/50',
                photo.status === 'pending' && 'bg-neutral-800 text-neutral-400 border-neutral-700/60'
              )}
              title={`Status: ${photo.status}`}
            >
              {photo.status}
            </span>
            {currentIndex >= 0 && (
              <span className="text-neutral-400 text-[11px] font-mono shrink-0 bg-neutral-800/90 px-1.5 py-0.5 rounded border border-neutral-700/50 hidden lg:inline-block">
                {currentIndex + 1} / {photos.length}
              </span>
            )}
          </div>

          {/* Re-analyze AI (icon-only) */}
          <button
            onClick={handleReanalyze}
            disabled={isReanalyzing || !photo}
            className="p-1.5 text-xs rounded-lg border border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer shrink-0"
            title="Re-analyze this photo with AI (Cmd+R)"
          >
            <RefreshCw size={12} className={isReanalyzing ? 'animate-spin text-purple-400' : 'text-neutral-500'} />
          </button>
        </div>

        {/* CENTER ZONE: View Modes & Quick Triage */}
        <div className="min-w-0 flex items-center gap-1 shrink-0">
          {/* Segmented view mode toggle */}
          <div
            className="flex items-center p-0.5 rounded-lg bg-neutral-800/90 border border-neutral-700/60 shrink-0"
            title="Review view mode"
          >
            <button
              type="button"
              className="px-2 sm:px-2.5 py-1 text-xs font-semibold rounded-md bg-neutral-700 text-white shadow-sm cursor-default"
              title="Single photo review (Loupe) — current view"
            >
              Loupe
            </button>
            <button
              type="button"
              onClick={handleOpenCompare}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700/70 transition-colors cursor-pointer"
              title="Side-by-Side 2-Up Compare (C)"
            >
              <Columns size={11} />
              <span className="hidden lg:inline">Compare</span>
            </button>
          </div>

          {/* Auto-Advance */}
          <button
            onClick={toggleAutoAdvance}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors cursor-pointer shrink-0',
              autoAdvance
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                : 'border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white'
            )}
            title="Toggle Auto-Advance on Rating (Caps Lock)"
          >
            <Zap size={11} className={autoAdvance ? 'text-emerald-400 fill-emerald-400/30' : 'text-neutral-500'} />
            <span className="hidden lg:inline">Auto-Advance</span>
          </button>

          {/* Tag Button */}
          <button
            onClick={() => photo && togglePhotoTag(photo.id)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors cursor-pointer shrink-0',
              photo?.is_tagged
                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 font-bold shadow-sm'
                : 'border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white'
            )}
            title="Toggle Tag ( \ )"
          >
            <span>🏷️</span>
            <span className="hidden xl:inline">{photo?.is_tagged ? 'Tagged' : 'Tag'}</span>
          </button>
        </div>

        {/* RIGHT ZONE: Consolidated Studio & View Tools */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
          {/* Info HUD (I) */}
          <button
            onClick={cycleHud}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shrink-0',
              hudMode > 0
                ? 'bg-cyan-500/20 border-cyan-500/70 text-cyan-300 font-semibold'
                : 'border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white'
            )}
            title="Cycle Photographic Info HUD: Triage / EXIF / Off (I)"
          >
            <Info size={12} className={hudMode > 0 ? 'text-cyan-400' : 'text-neutral-500'} />
            <span className="hidden xl:inline text-xs">HUD</span>
          </button>

          {/* Lights Out (L) */}
          <button
            onClick={cycleLightsOut}
            className={clsx(
              'p-1.5 text-xs rounded-lg border transition-colors cursor-pointer shrink-0',
              lightsOutLevel > 0
                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 font-semibold'
                : 'border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white'
            )}
            title="Lights Out Mode: Normal / 85% Dim / Blackout (L)"
          >
            <Moon size={12} className={lightsOutLevel > 0 ? 'text-amber-400' : 'text-neutral-500'} />
          </button>

          {/* View Options popover (menu rendered fixed at root to avoid overflow clipping) */}
          <div className="shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (viewOptionsAnchor) {
                  setViewOptionsAnchor(null)
                } else {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setViewOptionsAnchor({
                    x: rect.right,
                    y: rect.bottom,
                  })
                }
              }}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shadow-sm',
                viewOptionsAnchor
                  ? 'bg-neutral-700 border-neutral-600 text-white'
                  : 'border-neutral-700/80 bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white'
              )}
              title="View Options: clipping, histogram, face loupe, backdrop & filmstrip"
            >
              <Eye size={11} className="text-teal-400" />
              <span className="font-medium hidden xl:inline">View</span>
              <ChevronDown size={10} className="text-neutral-400" />
            </button>
          </div>

          {/* Workspaces Dropdown (menu rendered fixed at root to avoid overflow clipping) */}
          <div className="shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (workspacesMenuAnchor) {
                  setWorkspacesMenuAnchor(null)
                } else {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setWorkspacesMenuAnchor({
                    x: rect.right,
                    y: rect.bottom,
                  })
                }
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-full border border-neutral-700/80 bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors cursor-pointer shadow-sm"
              title="Switch or Save Workspaces"
            >
              <SlidersHorizontal size={11} className="text-indigo-400" />
              <span className="font-medium max-w-[50px] sm:max-w-[70px] md:max-w-[90px] lg:max-w-[120px] truncate">
                {activeWorkspace?.name || 'Workspace'}
              </span>
              <ChevronDown size={10} className="text-neutral-400" />
            </button>
          </div>

          {/* Customize Panels (Window > Customize Panels...) */}
          <button
            onClick={() => setShowPanelSelector(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Show or hide any panel (Customize Panels...)"
          >
            <LayoutGrid size={12} className="text-neutral-400" />
            <span className="hidden 2xl:inline text-xs">Panels</span>
          </button>

          {/* Inspector / Score Panel Toggle (Tab) */}
          <button
            onClick={toggleScorePanel}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer shrink-0',
              scorePanelDock !== 'collapsed'
                ? 'bg-blue-500/20 border-blue-500/70 text-blue-300 font-semibold'
                : 'border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white'
            )}
            title="Toggle Inspector Sidebar (Tab)"
          >
            <Sliders size={12} className={scorePanelDock !== 'collapsed' ? 'text-blue-400' : 'text-neutral-500'} />
            <span className="hidden 2xl:inline text-xs">Inspector</span>
            {scorePanelDock !== 'collapsed' ? <ChevronsRight size={11} className="text-blue-300" /> : <ChevronsLeft size={11} className="text-neutral-400" />}
          </button>

          {/* Export (Cmd+E) */}
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('app:open-export', {
                  detail: {
                    selectedIds: photo ? [photo.id] : [],
                    initialScope: photo?.is_tagged ? 'tagged' : photo?.status === 'accepted' ? 'accepted' : 'accepted'
                  }
                })
              )
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-neutral-700/80 bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Export Culled Photos (Cmd+E)"
          >
            <FolderUp size={12} className="text-indigo-400" />
            <span className="hidden xl:inline text-xs font-medium">Export</span>
          </button>

          {/* Fullscreen (F) */}
          <button
            onClick={() => setFullscreen(f => !f)}
            className="text-neutral-400 hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-neutral-800 shrink-0"
            title="Toggle fullscreen (F)"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Workspace Body (Docked Panels + Canvas) */}
      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">

      {/* ── Left Collapsed Icon Strip (48px Compact State) ── */}
      {scorePanelDock === 'collapsed' && lastActiveDockRef.current === 'left' && !fullscreen && (
        <div
          data-dock-zone="sidebar"
          onDragOver={(e) => {
            if (e.metaKey || e.ctrlKey) {
              setActiveDropZone(null)
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setActiveDropZone('sidebar')
          }}
          onDragLeave={() => setActiveDropZone(null)}
          onDrop={(e) => {
            e.preventDefault()
            setActiveDropZone(null)
            const data = e.dataTransfer.getData('text/plain')
            if (data && data.startsWith('inspector-box:')) {
              const moduleId = data.replace('inspector-box:', '')
              setModulePlacement(moduleId, 'sidebar')
              setScorePanelDock('left')
            }
          }}
          className={clsx(
            "relative flex-shrink-0 w-12 border-r border-neutral-800 bg-neutral-900/95 flex flex-col items-center py-2 justify-between select-none z-20 transition-all",
            lightsOutLevel === 1 && "lights-out-dim",
            lightsOutLevel === 2 && "lights-out-blackout pointer-events-none",
            activeDropZone === 'sidebar' && "bg-blue-950/60 border-r-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          )}
        >
          {/* Top expand button */}
          <button
            onClick={() => setScorePanelDock('left')}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer mb-2"
            title="Expand Full Inspector Sidebar (Tab or >>)"
          >
            <ChevronsRight size={16} />
          </button>

          {/* Module Icons Stack */}
          <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto scrollbar-none w-full px-1">
            {DEFAULT_MODULE_ORDER.map(modId => {
              const icon = MODULE_ICONS[modId]
              const title = MODULE_TITLES[modId] || modId
              const isActiveFlyout = activeFlyoutModule === modId

              return (
                <button
                  key={modId}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveFlyoutModule(prev => prev === modId ? null : modId)
                  }}
                  className={clsx(
                    "p-2 rounded-xl transition-all cursor-pointer relative group flex items-center justify-center w-9 h-9",
                    isActiveFlyout
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-800/80"
                  )}
                  title={`${title} (Click for Quick Flyout)`}
                >
                  {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { size: 16 }) : icon}
                </button>
              )
            })}
          </div>

          {/* Bottom indicator */}
          <div className="pt-2 text-neutral-500">
            <Sliders size={13} />
          </div>
        </div>
      )}

      {/* ── Left Docked Score panel ── */}
      {scorePanelDock === 'left' && !fullscreen && (
        <div
          data-dock-zone="sidebar"
          style={{ width: scorePanelWidth }}
          onDragOver={(e) => {
            if (e.metaKey || e.ctrlKey) {
              setActiveDropZone(null)
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setActiveDropZone('sidebar')
          }}
          onDragLeave={() => setActiveDropZone(null)}
          onDrop={(e) => {
            e.preventDefault()
            setActiveDropZone(null)
            const data = e.dataTransfer.getData('text/plain')
            if (data && data.startsWith('inspector-box:')) {
              const moduleId = data.replace('inspector-box:', '')
              setModulePlacement(moduleId, 'sidebar')
            }
          }}
          className={clsx(
            "relative flex-shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col h-full overflow-hidden transition-opacity duration-300",
            lightsOutLevel === 1 && "lights-out-dim",
            lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
          )}
        >
          {/* Glowing Drop Zone Overlay */}
          {activeDropZone === 'sidebar' && (
            <div className="absolute inset-0 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center text-blue-300 text-xs font-semibold tracking-wide pointer-events-none z-30 transition-all">
              Dock into Inspector Sidebar
            </div>
          )}
          <ScorePanel
            photo={photo}
            dockMode={scorePanelDock}
            onSetDockMode={setScorePanelDock}
            onSelectFace={handleSelectFace}
            onResetZoom={handleResetZoom}
            zoomLevel={zoomLevel}
            faceLoupeMode={faceLoupeMode}
            onSetFaceLoupeMode={setFaceLoupeModeAndStore}
            histogramMode={histogramMode}
            onSetHistogramMode={setHistogramModeAndStore}
            modulePlacements={modulePlacements}
            onSetModulePlacement={setModulePlacement}
            triagePlacement={triagePlacement}
            onSetTriagePlacement={setTriagePlacement}
            cullingBarVisible={showCullingBar}
            onStatus={handleStatus}
            onSkip={handleSkip}
            onToggleTag={() => photo && togglePhotoTag(photo.id)}
          />
          {/* Resize handle on right edge */}
          <div
            onMouseDown={startResizeLeft}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
            title="Drag to resize inspector width"
          />
        </div>
      )}

      {/* ── Main: Image area ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 relative overflow-hidden">
        {/* Image viewer */}
        <div
          onClick={() => {
            if (lightsOutLevel > 0) setLightsOutLevel(0)
            if (activeFlyoutModule) setActiveFlyoutModule(null)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (activeDropZone) setActiveDropZone(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            const data = e.dataTransfer.getData('text/plain')
            if (data && data.startsWith('inspector-box:')) {
              const moduleId = data.replace('inspector-box:', '')
              const floatPos = {
                x: Math.max(20, Math.min(window.innerWidth - 340, e.clientX - 150)),
                y: Math.max(60, Math.min(window.innerHeight - 200, e.clientY - 20))
              }
              setModulePlacement(moduleId, 'floating', floatPos)
            }
          }}
          className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden p-3 transition-colors duration-300"
          style={{
            backgroundColor: CANVAS_BACKDROP_OPTIONS.find(o => o.id === canvasBackdrop)?.color || 'var(--color-canvas-default)'
          }}
        >
          {/* Interactive Floating Histogram Widget */}
          <HistogramWidget
            imageUrl={api.getFullImageUrl(photo.id)}
            isOpen={histogramMode === 'floating'}
            onClose={() => setHistogramModeAndStore('hidden')}
            onDockToSidebar={() => setHistogramModeAndStore('sidebar')}
            onDockToBottom={() => setHistogramModeAndStore('bottom')}
          />

          {/* Prev arrow */}
          {prevPhoto && (
            <button
              onClick={() => navigate(`/review/${prevPhoto.id}`)}
              className={clsx(
                "absolute left-4 z-20 p-2.5 bg-black/60 hover:bg-black/90 rounded-full text-white transition-all cursor-pointer",
                lightsOutLevel === 1 && "opacity-40 hover:opacity-100",
                lightsOutLevel === 2 && "opacity-0 pointer-events-none"
              )}
              title="Previous (←)"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          {/* Image with status border & thumbnail blur-up placeholder */}
          <div className="relative h-full w-full flex items-center justify-center overflow-hidden">
            {!fullLoaded && (
              <img
                src={api.getThumbnailUrl(photo.id)}
                alt=""
                className="absolute max-h-full max-w-full object-contain rounded-lg opacity-90 transition-opacity pointer-events-none"
              />
            )}
            <img
              key={`${photo.id}-${authToken}`}
              src={api.getFullImageUrl(photo.id)}
              alt={photo.filename}
              decoding="async"
              ref={(el) => { if (el && el.complete && el.naturalWidth > 0 && !fullLoaded) setFullLoaded(true) }}
              onLoad={() => setFullLoaded(true)}
              onError={() => { initApiToken().then(tok => { if (tok) setAuthToken(tok) }) }}
              onClick={handleToggleZoom}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                transition: isHoldingZoom ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)',
                cursor: zoomLevel > 1 ? 'zoom-out' : 'zoom-in',
              }}
              className={clsx(
                'relative max-h-full max-w-full object-contain rounded-lg border-4 select-none shadow-2xl',
                statusColors[photo.status],
                fullLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />

            {/* Exposure Clipping Overlay (Blinkies) */}
            <ClippingOverlay
              imageUrl={api.getFullImageUrl(photo.id)}
              scale={zoomLevel}
              origin={zoomOrigin}
              isHoldingZoom={isHoldingZoom}
              enabled={showClipping}
            />

            {/* Photographic Info HUD Overlay (I) */}
            <InfoOverlay
              photo={photo}
              currentIndex={currentIndex >= 0 ? currentIndex : undefined}
              totalPhotos={photos.length}
              hudMode={hudMode}
              onCycleHud={cycleHud}
              onClose={() => { setHudMode(0); setReviewStorage('hud_mode', '0'); }}
            />

            {/* Offscreen Pre-render DOM cache to keep Chromium compositor layers primed */}
            <div className="hidden pointer-events-none select-none" aria-hidden="true">
              {nextPhoto && (
                <img
                  src={api.getFullImageUrl(nextPhoto.id)}
                  decoding="async"
                  alt=""
                />
              )}
              {prevPhoto && (
                <img
                  src={api.getFullImageUrl(prevPhoto.id)}
                  decoding="async"
                  alt=""
                />
              )}
            </div>
            {/* Zoom Loupe Indicator Pill */}
            {zoomLevel > 1 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/85 backdrop-blur-md border border-neutral-700/80 text-white text-xs font-medium px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-2.5 select-none animate-in fade-in duration-200">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span>{Math.round(zoomLevel * 100)}% Focus Zoom</span>
                {zoomedFace !== null && (
                  <>
                    <span className="text-neutral-500">·</span>
                    <span className="text-indigo-300 font-semibold">Face #{zoomedFace.index + 1}</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!photo) return
                        const newStatus = await toggleVipFaceStatus(photo.id, zoomedFace.index, zoomedFace.isVip)
                        setZoomedFace(prev => prev ? { ...prev, isVip: newStatus } : null)
                      }}
                      className={clsx(
                        "text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors border flex items-center gap-1",
                        zoomedFace.isVip
                          ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 hover:bg-yellow-500/30"
                          : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700"
                      )}
                      title={zoomedFace.isVip ? "Face is VIP. Click to Unpin" : "Click to Pin as VIP Subject"}
                    >
                      <Crown size={11} className={zoomedFace.isVip ? "text-yellow-400 fill-yellow-400" : "text-neutral-400"} />
                      <span>{zoomedFace.isVip ? "VIP Pinned" : "Pin VIP"}</span>
                    </button>
                  </>
                )}
                <button
                  onClick={handleResetZoom}
                  className="ml-0.5 text-[11px] text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded-full cursor-pointer transition-colors border border-neutral-700"
                  title="Fit to Screen (Esc or Click)"
                >
                  Fit Screen (Esc)
                </button>
              </div>
            )}
          </div>

          {/* Next arrow */}
          {nextPhoto && (
            <button
              onClick={() => navigate(`/review/${nextPhoto.id}`)}
              className={clsx(
                "absolute right-4 z-20 p-2.5 bg-black/60 hover:bg-black/90 rounded-full text-white transition-all cursor-pointer",
                lightsOutLevel === 1 && "opacity-40 hover:opacity-100",
                lightsOutLevel === 2 && "opacity-0 pointer-events-none"
              )}
              title="Next (→)"
            >
              <ArrowRight size={20} />
            </button>
          )}

          {/* Floating Culling Action Bar when placement is bottom */}
          {showCullingBar && triagePlacement === 'bottom' && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all">
              <CullingActionBar
                status={photo.status}
                isTagged={Boolean(photo.is_tagged)}
                onStatus={handleStatus}
                onSkip={handleSkip}
                onToggleTag={() => photo && togglePhotoTag(photo.id)}
                placement="bottom"
                onSetPlacement={setTriagePlacement}
                scale={triageScale}
                onSetScale={setTriageScale}
                isDimmed={lightsOutLevel === 1}
                isBlackout={lightsOutLevel === 2}
              />
            </div>
          )}
        </div>

        {/* Floating Face Loupe */}
        {faceLoupeMode === 'floating' && (
          <div className={clsx("transition-opacity duration-300", lightsOutLevel === 1 && "lights-out-dim", lightsOutLevel === 2 && "lights-out-blackout pointer-events-none")}>
            <FaceLoupe
              photoId={photo.id}
              onSelectFace={handleSelectFace}
              onResetZoom={handleResetZoom}
              zoomLevel={zoomLevel}
              isFloating={true}
              onToggleFloating={() => setFaceLoupeModeAndStore('bottom')}
              onDockToBottom={() => setFaceLoupeModeAndStore('bottom')}
              onDockToSidebar={() => setFaceLoupeModeAndStore('sidebar')}
              onClose={() => setFaceLoupeModeAndStore('hidden')}
            />
          </div>
        )}

        {/* Floating Inspector Modules (Overall, Reasons, Quality, Context, Camera, File) */}
        {DEFAULT_MODULE_ORDER.filter(id => id !== 'histogram' && id !== 'people').map((id, index) => {
          if (modulePlacements[id] !== 'floating') return null
          const title = MODULE_TITLES[id] || id
          const icon = MODULE_ICONS[id]

          return (
            <div
              key={id}
              className={clsx(
                "transition-opacity duration-300",
                lightsOutLevel === 1 && "lights-out-dim",
                lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
              )}
            >
              <DraggablePanel
                title={title}
                icon={icon}
                storageKey={`firstpass_panel_pos_${id}`}
                defaultPosition={{ x: 80 + (index % 4) * 30, y: 100 + (index % 4) * 35 }}
                width={320}
                isOpen={true}
                onClose={() => setModulePlacement(id, 'sidebar')}
                supportedDockZones={['sidebar', 'bottom']}
                onSnapDock={(zone) => setModulePlacement(id, zone)}
                headerControls={
                  <div className="flex items-center gap-1 mr-1">
                    <button
                      type="button"
                      onClick={() => setModulePlacement(id, 'bottom')}
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Dock to Bottom Stage Bar"
                    >
                      <Anchor size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModulePlacement(id, 'sidebar')}
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Dock into Inspector Sidebar"
                    >
                      <PanelRight size={11} />
                    </button>
                  </div>
                }
              >
                <div className="p-3">
                  <InspectorModuleContent
                    moduleId={id}
                    photo={photo}
                    compact={false}
                    onSelectFace={handleSelectFace}
                    onResetZoom={handleResetZoom}
                    zoomLevel={zoomLevel}
                    cullingBarVisible={showCullingBar}
                  />
                </div>
              </DraggablePanel>
            </div>
          )
        })}

        {/* Unified Bottom Dock: modules + filmstrip in one cohesive resizable stage bar */}
        {(showBottomModules || showBottomFilmstrip) && (
          <div
            className="w-full bg-neutral-950 border-t border-neutral-800 flex flex-col flex-shrink-0 relative z-20"
            style={{ height: isBottomCollapsed ? undefined : `${bottomBarHeight}px` }}
          >
          {/* Unified top resize handle spanning the entire dock */}
          <div
            onMouseDown={startResizeBottom}
            className="h-2 w-full cursor-row-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors flex items-center justify-center group shrink-0 select-none z-30"
            title="Drag up/down to resize bottom dock height (Double-click to collapse/expand)"
            onDoubleClick={() => setIsBottomCollapsed(prev => !prev)}
          >
            <div className="w-16 h-1 bg-neutral-700/80 rounded-full group-hover:bg-blue-400 group-active:bg-blue-300 transition-colors" />
          </div>
          <div className={isBottomSideBySide
            ? "flex-1 min-h-0 flex flex-row items-stretch w-full overflow-hidden"
            : "flex-1 min-h-0 flex flex-col w-full overflow-hidden"
          }>
          {showBottomModules && (
          <div
            data-dock-zone="bottom"
            onDragOver={(e) => {
              if (e.metaKey || e.ctrlKey) {
                setActiveDropZone(null)
                return
              }
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setActiveDropZone('bottom')
            }}
            onDragLeave={() => setActiveDropZone(null)}
            onDrop={(e) => {
              e.preventDefault()
              setActiveDropZone(null)
              const data = e.dataTransfer.getData('text/plain')
              if (data && data.startsWith('inspector-box:')) {
                const moduleId = data.replace('inspector-box:', '')
                setModulePlacement(moduleId, 'bottom')
              }
            }}
            style={isBottomSideBySide ? { width: `${bottomSplitWidth}px` } : undefined}
            className={clsx(
              "flex flex-col h-full min-h-0 bg-neutral-900/40 relative overflow-hidden",
              isBottomSideBySide ? "shrink-0" : "flex-shrink-0",
              bottomDockSwap === 'modules-left' ? "order-1" : "order-3",
              lightsOutLevel === 1 && "lights-out-dim",
              lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
            )}
          >
            {/* Polished universal drop landing marquee for the bottom dock */}
            {activeDropZone === 'bottom' && (
              <div className="absolute inset-0 bg-blue-500/20 border-2 border-blue-400 backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center text-blue-200 text-xs font-semibold pointer-events-none z-30">
                Release to Dock to Bottom Bar
              </div>
            )}
            {/* Horizontal Columns Container (flush, no nested island padding) */}
            <div
              id="bottom-groups-container"
              className="flex flex-row items-stretch w-full overflow-hidden flex-1 min-h-0"
            >
              {bottomGroups.map((group, groupIndex) => {
                const activeTab = group.tabs.includes(group.activeTab) ? group.activeTab : group.tabs[0] || ''
                const isDragActive = dragState.isDragging && dragState.item?.type === 'module-tab'
                const isSplitLeft = isDragActive && dragState.dropTarget?.type === 'bottom-split' && dragState.dropTarget.groupIndex === groupIndex && dragState.dropTarget.side === 'left'
                const isSplitRight = isDragActive && dragState.dropTarget?.type === 'bottom-split' && dragState.dropTarget.groupIndex === groupIndex && dragState.dropTarget.side === 'right'
                const isTabGroupTarget = isDragActive && dragState.dropTarget?.type === 'bottom-tab-group' && dragState.dropTarget.groupId === group.id

                return (
                  <React.Fragment key={group.id}>
                    {/* Draggable Vertical Splitter between columns */}
                    {groupIndex > 0 && (
                      <div
                        onMouseDown={(e) => startHorizontalResize(groupIndex, e)}
                        className="w-1.5 hover:w-2 bg-neutral-800/80 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-20 flex items-center justify-center group/splitter select-none"
                        title="Drag left/right to resize columns"
                      >
                        <div className="w-0.5 h-6 bg-neutral-600 rounded-full group-hover/splitter:bg-white" />
                      </div>
                    )}

                    {/* Column Panel Group (flush pane, 1px divider) */}
                    <div
                      style={{ flex: group.widthRatio || 1 }}
                      data-bottom-group-id={group.id}
                      data-bottom-group-index={groupIndex}
                      className={clsx(
                        "min-w-[200px] flex flex-col min-h-0 bg-transparent overflow-hidden relative border-r border-neutral-800 last:border-r-0",
                        isTabGroupTarget && "ring-2 ring-inset ring-blue-500/60"
                      )}
                    >
                      {/* Left Split Drop Target Indicator */}
                      {isSplitLeft && (
                        <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 z-30 flex items-center justify-center text-blue-300 font-semibold text-xs pointer-events-none">
                          <Split size={14} className="mr-1 rotate-180" />
                          <span>Split Left</span>
                        </div>
                      )}

                      {/* Right Split Drop Target Indicator */}
                      {isSplitRight && (
                        <div className="absolute inset-y-0 right-0 w-1/2 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 z-30 flex items-center justify-center text-blue-300 font-semibold text-xs pointer-events-none">
                          <Split size={14} className="mr-1" />
                          <span>Split Right</span>
                        </div>
                      )}

                      {/* Header / Tab bar */}
                      <div
                        className="flex items-center justify-between px-3 h-8 bg-neutral-950/80 border-b border-neutral-800 text-xs select-none cursor-grab active:cursor-grabbing shrink-0"
                        onPointerDown={(e) => handleBottomTabPointerDown(activeTab, group.id, e)}
                        onDoubleClick={() => setIsBottomCollapsed(prev => !prev)}
                        title="Drag tab upward to tear off into a floating window | Double-click to collapse/expand"
                      >
                        {/* Tabs list */}
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 min-w-0 mr-2">
                          {group.tabs.map(tabId => {
                            const title = MODULE_TITLES[tabId] || tabId
                            const icon = MODULE_ICONS[tabId]
                            const isActive = activeTab === tabId

                            return (
                              <div
                                key={tabId}
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  handleBottomTabPointerDown(tabId, group.id, e)
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  setIsBottomCollapsed(prev => !prev)
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectBottomTab(group.id, tabId)
                                }}
                                className={clsx(
                                  "group flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium cursor-grab active:cursor-grabbing select-none shrink-0 border-b-2 -mb-px transition-colors",
                                  isActive
                                    ? "bg-neutral-800/80 text-white border-blue-500"
                                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40 border-transparent"
                                )}
                                title={`${title} (Click to switch, drag to move/float, double-click to collapse)`}
                              >
                                <GripVertical size={11} className="text-neutral-500 group-hover:text-neutral-300 opacity-60 mr-0.5 pointer-events-none" />
                                {icon}
                                <span className="truncate max-w-[120px]">{title}</span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Right controls for this column */}
                        <div
                          className="flex items-center gap-1 flex-shrink-0"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {/* Swap modules / filmstrip sides */}
                          {isBottomSideBySide && (
                            <button
                              onClick={handleToggleBottomDockSwap}
                              className="p-1 rounded text-neutral-400 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                              title="Swap sides: modules ↔ filmstrip"
                            >
                              <ArrowLeftRight size={12} />
                            </button>
                          )}
                          {/* Split Column button */}
                          <button
                            onClick={() => handleSplitBottomGroup(groupIndex, activeTab, 'right')}
                            className="p-1 rounded text-neutral-400 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Split into Side-by-Side Column (→)"
                          >
                            <Split size={12} />
                          </button>

                          {/* Minimize / Expand button */}
                          <button
                            onClick={() => setIsBottomCollapsed(prev => !prev)}
                            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                            title={isBottomCollapsed ? "Expand Content" : "Collapse to Tab Bar"}
                          >
                            {isBottomCollapsed ? <Square size={12} /> : <Minus size={12} />}
                          </button>

                          {/* Float active tab */}
                          <button
                            onClick={() => setModulePlacement(activeTab, 'floating')}
                            className="p-1 rounded text-neutral-400 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                            title={`Float ${MODULE_TITLES[activeTab] || activeTab} as Movable Window (↗)`}
                          >
                            <Maximize2 size={12} />
                          </button>

                          {/* Dock to sidebar */}
                          <button
                            onClick={() => setModulePlacement(activeTab, 'sidebar')}
                            className="p-1 rounded text-neutral-400 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                            title={`Dock ${MODULE_TITLES[activeTab] || activeTab} into Inspector Sidebar (📌)`}
                          >
                            <PanelRight size={12} />
                          </button>

                          {/* Column menu (anchored, rendered fixed at root to avoid overflow clipping) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (columnMenuAnchor?.id === group.id) {
                                setColumnMenuAnchor(null)
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setColumnMenuAnchor({
                                  id: group.id,
                                  groupIndex,
                                  activeTab,
                                  x: rect.right,
                                  y: rect.top,
                                })
                              }
                            }}
                            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Column Options & Splitting"
                          >
                            <MoreHorizontal size={13} />
                          </button>

                          {/* Close tab / return to sidebar */}
                          <button
                            onClick={() => setModulePlacement(activeTab, 'sidebar')}
                            className="p-1 rounded text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Close (Return to Sidebar)"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Content for this column */}
                      {!isBottomCollapsed && (
                        <div className="p-2 flex-1 min-h-0 overflow-hidden flex flex-col justify-center">
                          {activeTab === 'people' ? (
                            <FaceLoupe
                              photoId={photo.id}
                              onSelectFace={handleSelectFace}
                              onResetZoom={handleResetZoom}
                              zoomLevel={zoomLevel}
                              isFloating={false}
                              layout="row"
                              hideHeader={true}
                              onToggleFloating={() => setModulePlacement('people', 'floating')}
                              onDockToBottom={() => setModulePlacement('people', 'bottom')}
                              onDockToSidebar={() => setModulePlacement('people', 'sidebar')}
                              onClose={() => setModulePlacement('people', 'sidebar')}
                            />
                          ) : activeTab === 'histogram' ? (
                            <div className="flex items-center justify-center max-w-xl mx-auto py-1">
                              <HistogramChart imageUrl={api.getFullImageUrl(photo.id)} />
                            </div>
                          ) : activeTab === 'culling' && showCullingBar ? (
                            <div className="py-1">
                              <CullingActionBar
                                status={photo.status}
                                isTagged={Boolean(photo.is_tagged)}
                                onStatus={handleStatus}
                                onSkip={handleSkip}
                                onToggleTag={() => photo && togglePhotoTag(photo.id)}
                                placement="sidebar"
                                scale="standard"
                              />
                            </div>
                          ) : (
                            <div className="max-w-3xl mx-auto">
                              <InspectorModuleContent
                                moduleId={activeTab}
                                photo={photo}
                                compact={true}
                                onSelectFace={handleSelectFace}
                                onResetZoom={handleResetZoom}
                                zoomLevel={zoomLevel}
                                cullingBarVisible={showCullingBar}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
          )}
          {/* Vertical splitter: drag left/right to resize modules vs filmstrip */}
          {isBottomSideBySide && !isBottomCollapsed && (
            <div
              onMouseDown={startBottomHorizontalSplitResize}
              onDoubleClick={handleResetBottomSplitWidth}
              className="w-1.5 hover:w-2 bg-neutral-800/80 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-20 flex items-center justify-center group/vsplit select-none order-2 self-stretch"
              title="Drag left/right to resize modules vs filmstrip (Double-click to reset to 420px)"
            >
              <div className="w-0.5 h-8 bg-neutral-600 rounded-full group-hover/vsplit:bg-white transition-colors" />
            </div>
          )}
          {/* Bottom Filmstrip pane (flush, takes remaining width when side-by-side) */}
          {showBottomFilmstrip && !isBottomCollapsed && (
            <div className={clsx(
              "flex-1 min-w-0 flex flex-col h-full min-h-0 bg-neutral-900/40 relative overflow-hidden",
              bottomDockSwap === 'modules-left' ? "order-3" : "order-1",
              lightsOutLevel === 1 && "lights-out-dim",
              lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
            )}>
              <Filmstrip
                photos={photos}
                currentPhotoId={photo.id}
                position="bottom"
                fillHeight={true}
                onSelectPhoto={(pid) => navigate(`/review/${pid}`)}
                onTogglePosition={() => setFilmstripPosition('side')}
                onSetPosition={setFilmstripPosition}
                onClose={() => setFilmstripPosition('hidden')}
                onStartDrag={handleFilmstripStartDrag}
                onSwapSides={isBottomSideBySide ? handleToggleBottomDockSwap : undefined}
              />
            </div>
          )}
          {/* Collapsed tab-bar hint */}
          {isBottomCollapsed && (showBottomModules || showBottomFilmstrip) && (
            <div className="px-3 pb-1.5 text-[10px] text-neutral-500 select-none">
              Bottom dock collapsed — double-click the handle above to expand
            </div>
          )}
          </div>
          </div>
        )}

        {/* Available Bottom Dock Zone when nothing is docked at bottom and user is dragging */}
        {bottomModules.length === 0 && activeDropZone === 'bottom' && (
          <div
            data-dock-zone="bottom"
            onDragOver={(e) => {
              if (e.metaKey || e.ctrlKey) {
                setActiveDropZone(null)
                return
              }
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setActiveDropZone('bottom')
            }}
            onDragLeave={() => setActiveDropZone(null)}
            onDrop={(e) => {
              e.preventDefault()
              setActiveDropZone(null)
              const data = e.dataTransfer.getData('text/plain')
              if (data && data.startsWith('inspector-box:')) {
                const moduleId = data.replace('inspector-box:', '')
                setModulePlacement(moduleId, 'bottom')
                setActiveBottomTab(moduleId)
              }
            }}
            className="mx-4 mb-2 h-20 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center text-blue-200 text-xs font-semibold transition-all"
          >
            <div className="flex items-center gap-2">
              <Anchor size={16} className="text-blue-400 animate-bounce" />
              <span>Release to Dock to Bottom Bar</span>
            </div>
          </div>
        )}

        {/* Adaptive Moveable Culling Action Bar (bottom placement floats over the photo viewport) */}
        {showCullingBar && triagePlacement !== 'sidebar' && triagePlacement !== 'bottom' && (
          <CullingActionBar
            status={photo.status}
            isTagged={Boolean(photo.is_tagged)}
            onStatus={handleStatus}
            onSkip={handleSkip}
            onToggleTag={() => photo && togglePhotoTag(photo.id)}
            placement={triagePlacement}
            onSetPlacement={setTriagePlacement}
            scale={triageScale}
            onSetScale={setTriageScale}
            isDimmed={lightsOutLevel === 1}
            isBlackout={lightsOutLevel === 2}
          />
        )}

        {/* Keyboard hint (compact single line) */}
        <div className={clsx(
          "flex items-center justify-center gap-3 py-0.5 text-[10px] text-neutral-400 flex-shrink-0 select-none transition-opacity duration-300",
          lightsOutLevel === 1 && "lights-out-dim",
          lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
        )}>
          <span><strong className="text-neutral-200">A</strong> Accept</span>
          <span>•</span>
          <span><strong className="text-neutral-200">R</strong> Reject</span>
          <span>•</span>
          <span><strong className="text-neutral-200">Space</strong> Skip</span>
          <span>•</span>
          <span><strong className="text-neutral-200">\</strong> Tag</span>
          <span>•</span>
          <span><strong className="text-neutral-200">Z</strong> Zoom</span>
          <span>•</span>
          <span><strong className="text-neutral-200">?</strong> All Shortcuts</span>
        </div>

        {/* Duplicate group strip */}
        {duplicateGroup.length > 0 && (
          <div className={clsx(
            "flex-shrink-0 border-t border-neutral-800 p-2.5 bg-neutral-950/60 transition-opacity duration-300",
            lightsOutLevel === 1 && "lights-out-dim",
            lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
          )}>
            <p className="text-neutral-500 text-xs mb-1.5">
              {duplicateGroup.length + 1} similar photos in this group
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {duplicateGroup.map(dup => (
                <button
                  key={dup.id}
                  onClick={() => navigate(`/review/${dup.id}`)}
                  className="flex-shrink-0 relative cursor-pointer"
                  title={dup.filename}
                >
                  <img
                    src={api.getThumbnailUrl(dup.id)}
                    alt={dup.filename}
                    className="w-14 h-14 object-cover rounded border border-neutral-700 hover:border-blue-500 transition-colors"
                  />
                  {dup.status === 'accepted' && (
                    <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full" />
                  )}
                  {dup.status === 'rejected' && (
                    <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Floating Filmstrip */}
      {filmstripPosition === 'floating' && !fullscreen && (
        <div className={clsx(
          "transition-opacity duration-300",
          lightsOutLevel === 1 && "lights-out-dim",
          lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
        )}>
          <DraggablePanel
            title={`Filmstrip (${photos.findIndex(p => p.id === photo.id) + 1}/${photos.length})`}
            icon={<Film size={13} className="text-blue-400" />}
            storageKey="firstpass_filmstrip_panel_pos"
            defaultPosition={{ x: Math.max(20, Math.round(window.innerWidth / 2 - 300)), y: Math.max(60, window.innerHeight - 200) }}
            width={600}
            height={150}
            minWidth={320}
            minHeight={110}
            maxWidth={Math.max(600, window.innerWidth - 60)}
            maxHeight={500}
            resizable={true}
            isOpen={true}
            onClose={() => setFilmstripPosition('hidden')}
            supportedDockZones={['bottom', 'sidebar']}
            onSnapDock={(zone) => setFilmstripPosition(zone === 'bottom' ? 'bottom' : 'side')}
            headerControls={
              <div className="flex items-center gap-1 mr-1">
                <button
                  type="button"
                  onClick={() => setFilmstripPosition('bottom')}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Dock Filmstrip to Bottom Stage"
                >
                  <PanelBottom size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setFilmstripPosition('side')}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Dock Filmstrip to Right Sidebar"
                >
                  <PanelRight size={11} />
                </button>
              </div>
            }
            className="flex flex-col overflow-hidden"
          >
            <div className="flex-1 min-h-0 -m-3 h-full">
              <Filmstrip
                photos={photos}
                currentPhotoId={photo.id}
                position="floating"
                fillHeight={true}
                onSelectPhoto={(pid) => navigate(`/review/${pid}`)}
                onSetPosition={setFilmstripPosition}
                onTogglePosition={() => setFilmstripPosition('bottom')}
                onClose={() => setFilmstripPosition('hidden')}
              />
            </div>
          </DraggablePanel>
        </div>
      )}

      {/* Side Filmstrip */}
      {filmstripPosition === 'side' && !fullscreen && (
        <div className={clsx(
          "transition-opacity duration-300",
          lightsOutLevel === 1 && "lights-out-dim",
          lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
        )}>
          <Filmstrip
            photos={photos}
            currentPhotoId={photo.id}
            position="side"
            onSelectPhoto={(pid) => navigate(`/review/${pid}`)}
            onTogglePosition={() => setFilmstripPosition('bottom')}
            onSetPosition={setFilmstripPosition}
            onClose={() => setFilmstripPosition('hidden')}
            onStartDrag={handleFilmstripStartDrag}
          />
        </div>
      )}

      {/* ── Right Docked Score panel ── */}
      {scorePanelDock === 'right' && !fullscreen && (
        <div
          data-dock-zone="sidebar"
          style={{ width: scorePanelWidth }}
          onDragOver={(e) => {
            if (e.metaKey || e.ctrlKey) {
              setActiveDropZone(null)
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setActiveDropZone('sidebar')
          }}
          onDragLeave={() => setActiveDropZone(null)}
          onDrop={(e) => {
            e.preventDefault()
            setActiveDropZone(null)
            const data = e.dataTransfer.getData('text/plain')
            if (data && data.startsWith('inspector-box:')) {
              const moduleId = data.replace('inspector-box:', '')
              setModulePlacement(moduleId, 'sidebar')
            }
          }}
          className={clsx(
            "relative flex-shrink-0 border-l border-neutral-800 bg-neutral-900 flex flex-col h-full overflow-hidden transition-opacity duration-300",
            lightsOutLevel === 1 && "lights-out-dim",
            lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
          )}
        >
          {/* Glowing Drop Zone Overlay */}
          {activeDropZone === 'sidebar' && (
            <div className="absolute inset-0 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center text-blue-300 text-xs font-semibold tracking-wide pointer-events-none z-30 transition-all">
              Dock into Inspector Sidebar
            </div>
          )}
          {/* Resize handle on left edge */}
          <div
            onMouseDown={startResizeRight}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
            title="Drag to resize inspector width"
          />
          <ScorePanel
            photo={photo}
            dockMode={scorePanelDock}
            onSetDockMode={setScorePanelDock}
            onSelectFace={handleSelectFace}
            onResetZoom={handleResetZoom}
            zoomLevel={zoomLevel}
            faceLoupeMode={faceLoupeMode}
            onSetFaceLoupeMode={setFaceLoupeModeAndStore}
            histogramMode={histogramMode}
            onSetHistogramMode={setHistogramModeAndStore}
            modulePlacements={modulePlacements}
            onSetModulePlacement={setModulePlacement}
            triagePlacement={triagePlacement}
            onSetTriagePlacement={setTriagePlacement}
            cullingBarVisible={showCullingBar}
            onStatus={handleStatus}
            onSkip={handleSkip}
            onToggleTag={() => photo && togglePhotoTag(photo.id)}
          />
        </div>
      )}

      {/* ── Right Collapsed Icon Strip (48px Compact State) ── */}
      {scorePanelDock === 'collapsed' && lastActiveDockRef.current !== 'left' && !fullscreen && (
        <div
          data-dock-zone="sidebar"
          onDragOver={(e) => {
            if (e.metaKey || e.ctrlKey) {
              setActiveDropZone(null)
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setActiveDropZone('sidebar')
          }}
          onDragLeave={() => setActiveDropZone(null)}
          onDrop={(e) => {
            e.preventDefault()
            setActiveDropZone(null)
            const data = e.dataTransfer.getData('text/plain')
            if (data && data.startsWith('inspector-box:')) {
              const moduleId = data.replace('inspector-box:', '')
              setModulePlacement(moduleId, 'sidebar')
              setScorePanelDock('right')
            }
          }}
          className={clsx(
            "relative flex-shrink-0 w-12 border-l border-neutral-800 bg-neutral-900/95 flex flex-col items-center py-2 justify-between select-none z-20 transition-all",
            lightsOutLevel === 1 && "lights-out-dim",
            lightsOutLevel === 2 && "lights-out-blackout pointer-events-none",
            activeDropZone === 'sidebar' && "bg-blue-950/60 border-l-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          )}
        >
          {/* Top expand button */}
          <button
            onClick={() => setScorePanelDock(lastActiveDockRef.current || 'right')}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer mb-2"
            title="Expand Full Inspector Sidebar (Tab or <<)"
          >
            <ChevronsLeft size={16} />
          </button>

          {/* Module Icons Stack */}
          <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto scrollbar-none w-full px-1">
            {DEFAULT_MODULE_ORDER.map(modId => {
              const icon = MODULE_ICONS[modId]
              const title = MODULE_TITLES[modId] || modId
              const isActiveFlyout = activeFlyoutModule === modId

              return (
                <button
                  key={modId}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveFlyoutModule(prev => prev === modId ? null : modId)
                  }}
                  className={clsx(
                    "p-2 rounded-xl transition-all cursor-pointer relative group flex items-center justify-center w-9 h-9",
                    isActiveFlyout
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-800/80"
                  )}
                  title={`${title} (Click for Quick Flyout)`}
                >
                  {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { size: 16 }) : icon}
                </button>
              )
            })}
          </div>

          {/* Bottom indicator */}
          <div className="pt-2 text-neutral-500">
            <Sliders size={13} />
          </div>
        </div>
      )}

      </div>{/* ── End Workspace Body (Docked Panels + Canvas) ── */}

      {/* ── Flyout Pop-Out Panel Overlay (When collapsed to icons) ── */}
      {scorePanelDock === 'collapsed' && activeFlyoutModule && !fullscreen && (
        <div
          className={clsx(
            "fixed z-50 w-80 max-h-[calc(100vh-100px)] flex flex-col bg-neutral-900/95 border border-neutral-700/80 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 top-12",
            lastActiveDockRef.current === 'left' ? "left-14" : "right-14"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Flyout Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-neutral-950/90 border-b border-neutral-800 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">{MODULE_ICONS[activeFlyoutModule]}</span>
              <span className="font-semibold text-xs text-white truncate">
                {MODULE_TITLES[activeFlyoutModule] || activeFlyoutModule}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              {/* Pin open as docked sidebar panel */}
              <button
                type="button"
                onClick={() => {
                  setScorePanelDock(lastActiveDockRef.current || 'right')
                  setActiveFlyoutModule(null)
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-600 transition-colors cursor-pointer"
                title="Pin Open (Expand Docked Sidebar)"
              >
                <Pin size={10} />
                <span>Pin Open</span>
              </button>

              {/* Undock as floating window */}
              <button
                type="button"
                onClick={() => {
                  setModulePlacement(activeFlyoutModule, 'floating')
                  setActiveFlyoutModule(null)
                }}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Undock as Floating Window"
              >
                <ExternalLink size={12} />
              </button>

              {/* Close flyout */}
              <button
                type="button"
                onClick={() => setActiveFlyoutModule(null)}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Close Flyout"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Flyout Body */}
          <div className="overflow-y-auto max-h-[calc(100vh-160px)] p-3">
            {activeFlyoutModule === 'people' ? (
              <FaceLoupe
                photoId={photo.id}
                onSelectFace={handleSelectFace}
                onResetZoom={handleResetZoom}
                zoomLevel={zoomLevel}
                isFloating={false}
                layout="sidebar"
                hideHeader={true}
                onToggleFloating={() => {
                  setModulePlacement('people', 'floating')
                  setActiveFlyoutModule(null)
                }}
                onDockToBottom={() => {
                  setModulePlacement('people', 'bottom')
                  setActiveFlyoutModule(null)
                }}
                onDockToSidebar={() => {
                  setScorePanelDock(lastActiveDockRef.current || 'right')
                  setActiveFlyoutModule(null)
                }}
                onClose={() => setActiveFlyoutModule(null)}
              />
            ) : activeFlyoutModule === 'histogram' ? (
              <div className="py-1">
                <HistogramChart imageUrl={api.getFullImageUrl(photo.id)} />
              </div>
            ) : (
              <InspectorModuleContent
                moduleId={activeFlyoutModule}
                photo={photo}
                compact={false}
                onSelectFace={handleSelectFace}
                onResetZoom={handleResetZoom}
                zoomLevel={zoomLevel}
                cullingBarVisible={showCullingBar}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Floating Sidebar Drop Target Overlay when inspector is floating ── */}
      {(scorePanelDock === 'floating' || scorePanelDock === 'collapsed') && !fullscreen && activeDropZone === 'sidebar' && (
        <div
          data-dock-zone="sidebar"
          className="fixed right-0 top-0 bottom-0 w-80 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 z-50 pointer-events-none flex flex-col items-center justify-center text-blue-200 font-semibold text-sm transition-all"
        >
          <Sliders size={28} className="mb-2 text-blue-400 animate-bounce" />
          <span>Release to Dock to Inspector Sidebar</span>
        </div>
      )}

      {/* ── Floating Score panel ── */}
      {scorePanelDock === 'floating' && !fullscreen && (
        <div className={clsx(
          "transition-opacity duration-300",
          lightsOutLevel === 1 && "lights-out-dim",
          lightsOutLevel === 2 && "lights-out-blackout pointer-events-none"
        )}>
          <DraggablePanel
            title="Inspector & AI Scores"
            icon={<Sliders size={13} className="text-blue-400" />}
            storageKey="firstpass_score_panel_pos"
            defaultPosition={{ x: Math.max(10, window.innerWidth - 380), y: 70 }}
            width={scorePanelWidth}
            isOpen={true}
            onClose={() => setScorePanelDock('collapsed')}
            supportedDockZones={['sidebar']}
            onSnapDock={(zone) => {
              if (zone === 'sidebar') {
                setScorePanelDock('right')
              }
            }}
            headerControls={
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={() => setScorePanelDock('left')}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Dock Inspector to Left"
                >
                  <PanelLeft size={11} />
                </button>
                <button
                  onClick={() => setScorePanelDock('right')}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Dock Inspector to Right"
                >
                  <PanelRight size={11} />
                </button>
              </div>
            }
            className="max-h-[95vh] flex flex-col"
          >
            <div className="flex-1 min-h-0 flex flex-col -m-3 p-3">
              <ScorePanel
                photo={photo}
                dockMode="floating"
                onSetDockMode={setScorePanelDock}
                isFloating={true}
                onSelectFace={handleSelectFace}
                onResetZoom={handleResetZoom}
                zoomLevel={zoomLevel}
                faceLoupeMode={faceLoupeMode}
                onSetFaceLoupeMode={setFaceLoupeModeAndStore}
                histogramMode={histogramMode}
                onSetHistogramMode={setHistogramModeAndStore}
                modulePlacements={modulePlacements}
                onSetModulePlacement={setModulePlacement}
                triagePlacement={triagePlacement}
                onSetTriagePlacement={setTriagePlacement}
                onStatus={handleStatus}
                onSkip={handleSkip}
                onToggleTag={() => photo && togglePhotoTag(photo.id)}
              />
            </div>
          </DraggablePanel>
        </div>
      )}

      {/* Save Custom Workspace Modal */}
      {showSaveWorkspaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <h3 className="text-base font-bold text-white">Save Custom Workspace</h3>
              </div>
              <button
                onClick={() => setShowSaveWorkspaceModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Capture your current multi-zone layout (sidebar dock & width, floating panels, face loupe, histogram placement, and HUD positioning) as a custom workspace.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Workspace Name</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Dual-Screen Wedding Culling"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCurrentWorkspace()
                  if (e.key === 'Escape') setShowSaveWorkspaceModal(false)
                }}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800/80 text-[11px] space-y-1.5 text-neutral-400">
              <div className="font-semibold text-neutral-300 mb-1">Current Configuration:</div>
              <div className="flex justify-between">
                <span>Inspector Sidebar:</span>
                <span className="text-neutral-200 capitalize font-mono">{scorePanelDock} ({scorePanelWidth}px)</span>
              </div>
              <div className="flex justify-between">
                <span>Histogram:</span>
                <span className="text-neutral-200 capitalize font-mono">{histogramMode}</span>
              </div>
              <div className="flex justify-between">
                <span>Face Loupe:</span>
                <span className="text-neutral-200 capitalize font-mono">{faceLoupeMode}</span>
              </div>
              <div className="flex justify-between">
                <span>Filmstrip:</span>
                <span className="text-neutral-200 capitalize font-mono">{filmstripPosition}</span>
              </div>
              <div className="flex justify-between">
                <span>Canvas Backdrop:</span>
                <span className="text-neutral-200 capitalize font-mono">{canvasBackdrop}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowSaveWorkspaceModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentWorkspace}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30"
              >
                Save Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Options popover (fixed at root so overflow containers can't clip it) */}
      {viewOptionsAnchor && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setViewOptionsAnchor(null)} />
          <div
            style={{
              position: 'fixed',
              top: `${viewOptionsAnchor.y + 4}px`,
              right: `${Math.max(10, window.innerWidth - viewOptionsAnchor.x)}px`,
              zIndex: 10000,
            }}
            className="w-72 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100 max-h-[calc(100vh-80px)] overflow-y-auto"
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-400 font-bold border-b border-neutral-800">
              View Options
            </div>

            {/* Exposure Clipping */}
            <button
              onClick={() => setShowClipping(prev => !prev)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer"
              title="Toggle Exposure Clipping Overlay (E)"
            >
              <span className={showClipping ? 'text-rose-300 font-semibold' : 'text-neutral-300'}>
                Exposure Clipping <span className="text-neutral-500 font-mono text-[10px]">(E)</span>
              </span>
              {showClipping && <Check size={13} className="text-rose-400 shrink-0" />}
            </button>

            <div className="border-t border-neutral-800 mt-1 pt-1 px-3 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold py-1">
                Histogram <span className="text-neutral-600 font-mono normal-case">(H cycles)</span>
              </div>
              <div className="flex flex-wrap gap-1 pb-1">
                {(['sidebar', 'floating', 'hidden'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setHistogramModeAndStore(mode)}
                    className={clsx(
                      'px-2 py-1 text-[11px] rounded-md border capitalize transition-colors cursor-pointer',
                      histogramMode === mode
                        ? 'bg-purple-500/20 border-purple-500/60 text-purple-200 font-semibold'
                        : 'border-neutral-700/70 text-neutral-400 hover:text-white hover:bg-neutral-800'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-1 px-3 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold py-1">
                Face Loupe
              </div>
              <div className="flex flex-wrap gap-1 pb-1">
                {(['bottom', 'sidebar', 'floating', 'hidden'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFaceLoupeModeAndStore(mode)}
                    className={clsx(
                      'px-2 py-1 text-[11px] rounded-md border capitalize transition-colors cursor-pointer',
                      faceLoupeMode === mode
                        ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200 font-semibold'
                        : 'border-neutral-700/70 text-neutral-400 hover:text-white hover:bg-neutral-800'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-1 px-3 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold py-1">
                Canvas Backdrop
              </div>
              <div className="flex flex-wrap gap-1 pb-1">
                {([
                  { id: 'black', label: 'Black' },
                  { id: 'dark', label: 'Dark Gray' },
                  { id: 'neutral', label: '18% Neutral Gray' },
                  { id: 'theme', label: 'Theme' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setCanvasBackdrop(opt.id)}
                    className={clsx(
                      'px-2 py-1 text-[11px] rounded-md border transition-colors cursor-pointer',
                      canvasBackdrop === opt.id
                        ? 'bg-teal-500/20 border-teal-500/60 text-teal-200 font-semibold'
                        : 'border-neutral-700/70 text-neutral-400 hover:text-white hover:bg-neutral-800'
                    )}
                    title={opt.id === 'neutral' ? '18% calibrated neutral gray' : opt.label}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-1 px-3 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold py-1">
                Filmstrip <span className="text-neutral-600 font-mono normal-case">(B cycles)</span>
              </div>
              <div className="flex flex-wrap gap-1 pb-1">
                {(['bottom', 'side', 'floating', 'hidden'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setFilmstripPosition(pos as typeof filmstripPosition)}
                    className={clsx(
                      'px-2 py-1 text-[11px] rounded-md border capitalize transition-colors cursor-pointer',
                      filmstripPosition === pos
                        ? 'bg-blue-500/20 border-blue-500/60 text-blue-200 font-semibold'
                        : 'border-neutral-700/70 text-neutral-400 hover:text-white hover:bg-neutral-800'
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Workspaces menu (fixed at root so overflow containers can't clip it) */}
      {workspacesMenuAnchor && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setWorkspacesMenuAnchor(null)} />
          <div
            style={{
              position: 'fixed',
              top: `${workspacesMenuAnchor.y + 4}px`,
              right: `${Math.max(10, window.innerWidth - workspacesMenuAnchor.x)}px`,
              zIndex: 10000,
            }}
            className="w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-400 font-bold border-b border-neutral-800 flex items-center justify-between">
              <span>Preset Workspaces</span>
              <span className="text-neutral-500 font-normal">Studio Presets</span>
            </div>
            {PRESET_WORKSPACES.map(preset => (
              <button
                key={preset.id}
                onClick={() => {
                  applyWorkspace(preset)
                  setWorkspacesMenuAnchor(null)
                }}
                className={clsx(
                  'w-full flex items-start justify-between px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5 cursor-pointer',
                  activeWorkspaceId === preset.id ? 'text-blue-400 font-semibold bg-blue-500/10' : 'text-neutral-300'
                )}
              >
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    <span>{preset.name}</span>
                  </div>
                  {preset.description && (
                    <div className="text-[10px] text-neutral-500 line-clamp-1 mt-0.5">{preset.description}</div>
                  )}
                </div>
                {activeWorkspaceId === preset.id && <Check size={13} className="shrink-0 mt-0.5" />}
              </button>
            ))}

            {/* Custom user workspaces */}
            {customWorkspaces.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-400 font-bold border-t border-b border-neutral-800 mt-1">
                  Custom Workspaces
                </div>
                {customWorkspaces.map(custom => (
                  <div
                    key={custom.id}
                    className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/5 group"
                  >
                    <button
                      onClick={() => {
                        applyWorkspace(custom)
                        setWorkspacesMenuAnchor(null)
                      }}
                      className={clsx(
                        'flex-1 text-left truncate cursor-pointer',
                        activeWorkspaceId === custom.id ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                      )}
                    >
                      {custom.name}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCustomWorkspace(custom.id)
                      }}
                      className="text-neutral-600 hover:text-rose-400 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete this workspace"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}

            <div className="border-t border-neutral-800 mt-1 pt-1 px-1">
              <button
                onClick={() => {
                  setWorkspacesMenuAnchor(null)
                  setShowSaveWorkspaceModal(true)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
              >
                <Sparkles size={12} className="text-amber-400" />
                <span>Save Current Layout As...</span>
              </button>
              <button
                onClick={() => {
                  applyWorkspace(resetWorkspace(activeWorkspaceId))
                  setWorkspacesMenuAnchor(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-amber-300 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
              >
                <RotateCcw size={12} />
                <span>Reset to Default Layout</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Column options menu (fixed at root so overflow-hidden containers can't clip it) */}
      {columnMenuAnchor && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setColumnMenuAnchor(null)} />
          <div
            style={{
              position: 'fixed',
              bottom: `${Math.max(10, window.innerHeight - columnMenuAnchor.y + 4)}px`,
              right: `${Math.max(10, window.innerWidth - columnMenuAnchor.x)}px`,
              zIndex: 60,
            }}
            className="w-56 bg-neutral-900 border border-neutral-700/90 rounded-xl shadow-2xl py-1 text-xs text-neutral-300 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Column & Split Actions
            </div>
            <button
              onClick={() => {
                handleSplitBottomGroup(columnMenuAnchor.groupIndex, columnMenuAnchor.activeTab, 'right')
                setColumnMenuAnchor(null)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Split size={12} />
              <span>Split to New Column (→)</span>
            </button>
            {bottomGroups.length > 1 && (
              <button
                onClick={() => {
                  handleMergeBottomGroups()
                  setColumnMenuAnchor(null)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <Columns size={12} />
                <span>Merge All Columns into One</span>
              </button>
            )}
            <button
              onClick={() => {
                setModulePlacement(columnMenuAnchor.activeTab, 'floating')
                setColumnMenuAnchor(null)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <ExternalLink size={12} />
              <span>Float Current Tab (↗)</span>
            </button>
            <button
              onClick={() => {
                setModulePlacement(columnMenuAnchor.activeTab, 'sidebar')
                setColumnMenuAnchor(null)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <PanelRight size={12} />
              <span>Dock to Sidebar (📌)</span>
            </button>
            <div className="border-t border-neutral-800 my-1" />
            <button
              onClick={() => {
                setIsBottomCollapsed(prev => !prev)
                setColumnMenuAnchor(null)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
            >
              {isBottomCollapsed ? <Square size={12} /> : <Minus size={12} />}
              <span>{isBottomCollapsed ? 'Expand Content' : 'Collapse Content'}</span>
            </button>
          </div>
        </>
      )}

      {/* Studio Themes Picker Modal */}
      <ThemePickerModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        onCanvasBackdropChange={setCanvasBackdrop}
      />

      {/* Adobe-style Panel Selector (Show / Hide Panels) */}
      <PanelSelectorModal
        isOpen={showPanelSelector}
        onClose={() => setShowPanelSelector(false)}
        items={panelSelectorItems}
        onToggle={togglePanelVisibility}
        onShowAll={showAllPanels}
        onResetDefaults={resetDefaultPanels}
      />
    </div>
  )
}
