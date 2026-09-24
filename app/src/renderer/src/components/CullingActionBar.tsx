import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Check, X, SkipForward, Bookmark, GripVertical, MoreVertical,
  ArrowDown, ArrowLeft, ArrowRight, Move, Maximize2, Minimize2, PanelRight, RotateCcw
} from 'lucide-react'
import clsx from 'clsx'
import { dockDragManager } from '../utils/dockDragManager'

export type TriagePlacement = 'bottom' | 'side-left' | 'side-right' | 'floating' | 'sidebar'
export type TriageScale = 'compact' | 'standard' | 'large'

const MIN_FLOAT_WIDTH = 220
const MAX_FLOAT_WIDTH = 480
const NARROW_FLOAT_ICON_THRESHOLD = 380

export interface CullingActionBarProps {
  status?: 'accepted' | 'rejected' | 'pending'
  isTagged?: boolean
  onStatus: (status: 'accepted' | 'rejected' | 'pending') => void
  onToggleTag?: () => void
  placement?: TriagePlacement
  onSetPlacement?: (placement: TriagePlacement) => void
  scale?: TriageScale
  onSetScale?: (scale: TriageScale) => void
  isDimmed?: boolean
  isBlackout?: boolean
}

export default function CullingActionBar({
  status,
  isTagged = false,
  onStatus,
  onToggleTag,
  placement: controlledPlacement,
  onSetPlacement,
  scale: controlledScale,
  onSetScale,
  isDimmed = false,
  isBlackout = false,
}: CullingActionBarProps) {
  // Local persistence for placement and scale
  const [placement, setPlacement] = useState<TriagePlacement>(() => {
    if (controlledPlacement) return controlledPlacement
    try {
      const saved = localStorage.getItem('photo_culler_triage_placement')
      if (saved && ['bottom', 'side-left', 'side-right', 'floating', 'sidebar'].includes(saved)) {
        return saved as TriagePlacement
      }
    } catch {}
    return 'bottom'
  })

  const [scale, setScale] = useState<TriageScale>(() => {
    if (controlledScale) return controlledScale
    try {
      const saved = localStorage.getItem('photo_culler_triage_scale')
      if (saved && ['compact', 'standard', 'large'].includes(saved)) {
        return saved as TriageScale
      }
    } catch {}
    return 'standard'
  })

  const [floatPos, setFloatPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('photo_culler_triage_hud_pos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.min(window.innerWidth - 200, Math.max(10, parsed.x)),
            y: Math.min(window.innerHeight - 80, Math.max(10, parsed.y)),
          }
        }
      }
    } catch {}
    return {
      x: Math.round(window.innerWidth / 2 - 180),
      y: Math.max(60, window.innerHeight - 130),
    }
  })

  const [floatWidth, setFloatWidth] = useState<number | undefined>(() => {
    try {
      const saved = localStorage.getItem('photo_culler_triage_float_width')
      if (saved) {
        const val = parseFloat(saved)
        if (isNaN(val)) {
          try {
            localStorage.removeItem('photo_culler_triage_float_width')
          } catch {}
          return undefined
        }
        return Math.min(MAX_FLOAT_WIDTH, Math.max(MIN_FLOAT_WIDTH, val))
      }
    } catch {}
    return undefined
  })

  // Options menu anchor in viewport coords; the menu renders via portal with
  // position:fixed so scroll/overflow containers can never clip it.
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  // Direct 1:1 floating drag: the bar tracks the cursor with zero lag while
  // dragging (transition: none), then magnetic-snaps + persists on release.
  const [isFloatDragging, setIsFloatDragging] = useState(false)
  const floatDragOffsetRef = useRef({ x: 100, y: 25 })
  const placementRef = useRef(placement)
  placementRef.current = placement
  const floatPosRef = useRef(floatPos)
  floatPosRef.current = floatPos

  // Sync controlled props
  useEffect(() => {
    if (controlledPlacement) setPlacement(controlledPlacement)
  }, [controlledPlacement])

  useEffect(() => {
    if (controlledScale) setScale(controlledScale)
  }, [controlledScale])

  // Close the options menu on Escape
  useEffect(() => {
    if (!menuAnchor) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMenuAnchor(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [menuAnchor])

  const handleUpdatePlacement = (newPlacement: TriagePlacement) => {
    setPlacement(newPlacement)
    try {
      localStorage.setItem('photo_culler_triage_placement', newPlacement)
    } catch {}
    if (onSetPlacement) onSetPlacement(newPlacement)
    setMenuAnchor(null)
  }

  const handleUpdateScale = (newScale: TriageScale) => {
    setScale(newScale)
    try {
      localStorage.setItem('photo_culler_triage_scale', newScale)
    } catch {}
    if (onSetScale) onSetScale(newScale)
    const presetWidth =
      newScale === 'compact' ? 240 : newScale === 'large' ? MAX_FLOAT_WIDTH : 420
    setFloatWidth(presetWidth)
    try {
      localStorage.setItem('photo_culler_triage_float_width', String(presetWidth))
    } catch {}
    setMenuAnchor(null)
  }

  // Pointer-based smooth dragging & docking to lines.
  // In floating mode the bar itself tracks the cursor 1:1 (transition: none)
  // via direct position updates; the ghost overlay only shows drop targets.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button:not([data-drag-handle])')) return

    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = false
    if (placementRef.current === 'floating') {
      floatDragOffsetRef.current = {
        x: e.clientX - floatPosRef.current.x,
        y: e.clientY - floatPosRef.current.y,
      }
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch {}

    const handlePointerMove = (ev: PointerEvent) => {
      if (!pointerStartRef.current) return
      const dx = ev.clientX - pointerStartRef.current.x
      const dy = ev.clientY - pointerStartRef.current.y

      if (!isDraggingRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDraggingRef.current = true
        if (placementRef.current === 'floating') setIsFloatDragging(true)
        dockDragManager.startDrag(
          {
            type: 'sorting-bar',
            id: 'sorting-bar',
            title: 'Culling Action Bar',
            sourceZone: placementRef.current === 'bottom' ? 'bottom' : placementRef.current === 'floating' ? 'floating' : 'sidebar',
          },
          ev.clientX,
          ev.clientY
        )
      }

      if (isDraggingRef.current) {
        // Direct 1:1 tracking for a floating bar: move the bar under the
        // cursor with sub-pixel smoothness (no transition, no snap yet).
        if (placementRef.current === 'floating') {
          const barW = barRef.current?.offsetWidth || 420
          const barH = barRef.current?.offsetHeight || 60
          const rawX = ev.clientX - floatDragOffsetRef.current.x
          const rawY = ev.clientY - floatDragOffsetRef.current.y
          const clampedX = Math.max(
            10,
            Math.min(Math.max(10, window.innerWidth - barW - 10), rawX)
          )
          const clampedY = Math.max(
            10,
            Math.min(Math.max(10, window.innerHeight - barH - 10), rawY)
          )
          setFloatPos({ x: clampedX, y: clampedY })
        }
        // Evaluate drop target proximity to lines based on center viewport bounds
        let targetType: 'bottom-dock' | 'side-dock' | 'canvas' = 'canvas'
        let side: 'left' | 'right' = 'left'

        const centerEl = barRef.current?.parentElement
        const rect = centerEl?.getBoundingClientRect() || {
          left: 64,
          right: window.innerWidth - 320,
          top: 0,
          bottom: window.innerHeight,
        }

        if (ev.clientX >= window.innerWidth - 320) {
          targetType = 'sidebar-dock' as any
        } else if (ev.clientY >= rect.bottom - 110) {
          targetType = 'bottom-dock'
        } else if (ev.clientX <= rect.left + 90) {
          targetType = 'side-dock'
          side = 'left'
        } else if (ev.clientX >= rect.right - 90) {
          targetType = 'side-dock'
          side = 'right'
        }

        if ((targetType as any) === 'sidebar-dock') {
          dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey, { type: 'sidebar-dock' })
        } else if (targetType === 'bottom-dock') {
          dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey, { type: 'bottom-dock' })
        } else if (targetType === 'side-dock') {
          dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey, { type: 'side-dock', side })
        } else {
          dockDragManager.updateDrag(ev.clientX, ev.clientY, ev.metaKey || ev.ctrlKey)
        }
      }
    }

    const handlePointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      setIsFloatDragging(false)

      if (isDraggingRef.current) {
        isDraggingRef.current = false
        const wasFloating = placementRef.current === 'floating'
        const drop = dockDragManager.endDrag()
        if (drop && drop.dropTarget) {
          if (drop.dropTarget.type === 'sidebar-dock') {
            handleUpdatePlacement('sidebar')
          } else if (drop.dropTarget.type === 'bottom-dock') {
            handleUpdatePlacement('bottom')
          } else if (drop.dropTarget.type === 'side-dock') {
            handleUpdatePlacement(drop.dropTarget.side === 'left' ? 'side-left' : 'side-right')
          } else {
            // Free float at mouse release (with magnetic edge snapping).
            // When already floating the bar tracked the cursor live, so snap
            // from its live position; otherwise anchor at the release point.
            handleUpdatePlacement('floating')
            const barW = barRef.current?.offsetWidth || 420
            const barH = barRef.current?.offsetHeight || 60
            const rawX = wasFloating ? floatPosRef.current.x : ev.clientX - 100
            const rawY = wasFloating ? floatPosRef.current.y : ev.clientY - 25
            // Magnetic boundary snap when floating within 16px of screen edges
            // (left=10px, right=window.innerWidth - width - 10px,
            //  top=10px, bottom=window.innerHeight - height - 10px).
            const SNAP_DISTANCE = 16
            const EDGE_OFFSET = 10
            const rightEdge = window.innerWidth - barW - EDGE_OFFSET
            const bottomEdge = window.innerHeight - barH - EDGE_OFFSET
            let snappedX = rawX
            if (Math.abs(rawX - EDGE_OFFSET) <= SNAP_DISTANCE) {
              snappedX = EDGE_OFFSET
            } else if (Math.abs(rawX - rightEdge) <= SNAP_DISTANCE) {
              snappedX = rightEdge
            }
            let snappedY = rawY
            if (Math.abs(rawY - EDGE_OFFSET) <= SNAP_DISTANCE) {
              snappedY = EDGE_OFFSET
            } else if (Math.abs(rawY - bottomEdge) <= SNAP_DISTANCE) {
              snappedY = bottomEdge
            }
            const clampedX = Math.max(
              EDGE_OFFSET,
              Math.min(Math.max(EDGE_OFFSET, rightEdge), snappedX)
            )
            const clampedY = Math.max(
              EDGE_OFFSET,
              Math.min(Math.max(EDGE_OFFSET, bottomEdge), snappedY)
            )
            const newPos = { x: Math.round(clampedX), y: Math.round(clampedY) }
            setFloatPos(newPos)
            try {
              localStorage.setItem('photo_culler_triage_hud_pos', JSON.stringify(newPos))
            } catch {}
          }
        }
      }
      pointerStartRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  // Floating Action Bar Resizing
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = barRef.current?.offsetWidth || 420

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX
      const newWidth = Math.min(MAX_FLOAT_WIDTH, Math.max(MIN_FLOAT_WIDTH, startWidth + deltaX))
      setFloatWidth(newWidth)
    }

    const handlePointerUp = () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      setFloatWidth((finalW) => {
        if (finalW) {
          try {
            localStorage.setItem('photo_culler_triage_float_width', String(finalW))
          } catch {}
        }
        return finalW
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  if (isBlackout) return null

  const isSidebar = placement === 'sidebar'
  const isVertical = placement === 'side-left' || placement === 'side-right'

  // Scale configurations.
  // Compact mode is icon-only (no text) with fixed square buttons so labels
  // can never clip into single-letter ellipses. Standard/large buttons keep
  // full words with whitespace-nowrap and a comfortable minimum width.
  const isCompact = scale === 'compact'
  const scaleClasses = isCompact
    ? {
        container: isSidebar ? 'p-2 gap-1.5' : isVertical ? 'p-1.5 gap-1.5' : 'px-3 py-1.5 gap-2',
        btn: 'w-9 h-9 p-2 rounded-xl flex items-center justify-center',
        iconSize: 15,
        showText: false,
      }
    : isSidebar
    ? {
        container: 'p-2 gap-1.5',
        btn: 'min-w-[76px] w-full px-3.5 py-1.5 text-xs whitespace-nowrap font-medium flex items-center justify-center gap-1.5',
        iconSize: 14,
        showText: true,
      }
    : {
        standard: {
          container: isVertical ? 'p-2 gap-2' : 'px-4 py-2 gap-3',
          btn: isVertical
            ? 'py-2 px-1 w-16 min-w-[76px] flex flex-col items-center justify-center text-[10px] leading-tight gap-0.5 whitespace-nowrap'
            : 'min-w-[76px] px-3.5 py-1.5 text-sm whitespace-nowrap font-medium flex items-center justify-center gap-2',
          iconSize: 16,
          showText: true,
        },
        large: {
          container: isVertical ? 'p-2.5 gap-2.5' : 'px-5 py-2.5 gap-3.5',
          btn: isVertical
            ? 'py-2.5 px-1.5 w-18 min-w-[76px] flex flex-col items-center justify-center text-xs font-semibold gap-1 whitespace-nowrap'
            : 'min-w-[76px] px-3.5 py-1.5 text-base font-semibold whitespace-nowrap flex items-center justify-center gap-2.5',
          iconSize: 20,
          showText: true,
        },
      }[scale as 'standard' | 'large'] ?? {
        container: isVertical ? 'p-2 gap-2' : 'px-4 py-2 gap-3',
        btn: isVertical
          ? 'py-2 px-1 w-16 min-w-[76px] flex flex-col items-center justify-center text-[10px] leading-tight gap-0.5 whitespace-nowrap'
          : 'min-w-[76px] px-3.5 py-1.5 text-sm whitespace-nowrap font-medium flex items-center justify-center gap-2',
        iconSize: 16,
        showText: true,
      }

  // Floating width bounds + adaptive density. Narrow float widths (or the
  // Compact scale) collapse to icon-only square buttons so labels can never
  // squash into single-letter ellipses.
  const isFloating = placement === 'floating'
  const useDistributedRow = !isSidebar && !isVertical
  const narrowFloatIconOnly =
    isFloating && floatWidth !== undefined && floatWidth < NARROW_FLOAT_ICON_THRESHOLD
  const iconOnly = isCompact || narrowFloatIconOnly
  const showText = !iconOnly && scaleClasses.showText
  const actionBtnClass = iconOnly
    ? 'w-9 h-9 p-2 rounded-xl flex items-center justify-center'
    : scaleClasses.btn
  // In floating text mode, let buttons share extra width evenly so the bar
  // fills toward MAX_FLOAT_WIDTH without dead gaps on the right.
  const floatingFillClass =
    isFloating && !iconOnly ? 'flex-1 max-w-[100px] min-w-[72px]' : ''

  return (
    <div
      ref={barRef}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuAnchor({ x: e.clientX, y: e.clientY })
      }}
      className={clsx(
        'select-none z-40',
        !isFloatDragging && 'transition-all duration-200',
        isDimmed && 'opacity-30 hover:opacity-100',
        placement === 'sidebar' && 'w-full py-1.5 px-1 flex-shrink-0',
        placement === 'bottom' && 'flex items-center justify-center py-2 flex-shrink-0',
        placement === 'side-left' && 'absolute left-4 top-1/2 -translate-y-1/2',
        placement === 'side-right' && 'absolute right-4 top-1/2 -translate-y-1/2',
        placement === 'floating' && 'fixed',
        placement === 'floating' && 'max-w-[480px]'
      )}
      style={
        placement === 'floating'
          ? {
              left: `${floatPos.x}px`,
              top: `${floatPos.y}px`,
              width: floatWidth ? `${floatWidth}px` : undefined,
              // Track the cursor 1:1 while dragging: no transition lag.
              transition: isFloatDragging ? 'none' : undefined,
              willChange: isFloatDragging ? 'left, top' : undefined,
            }
          : undefined
      }
    >
      <div
        className={clsx(
          'bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-2xl shadow-2xl transition-all',
          isSidebar
            ? 'grid grid-cols-2 gap-1.5 w-full p-2'
            : isFloating && floatWidth
              ? 'flex items-center w-full'
              : 'flex items-center w-auto min-w-max',
          !isSidebar && (isVertical ? 'flex-col' : 'flex-row'),
          !isSidebar && scaleClasses.container
        )}
      >
        {/* Drag Grip Handle */}
        <div
          data-drag-handle
          onPointerDown={handlePointerDown}
          className={clsx(
            'p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 rounded-lg cursor-grab active:cursor-grabbing transition-colors shrink-0',
            isSidebar && 'col-span-2 flex justify-center w-full'
          )}
          title="Drag to right sidebar, bottom line, side edges, or float anywhere"
        >
          <GripVertical size={13} />
        </div>

        {/* Center button group: fills + centers in distributed rows, transparent elsewhere */}
        <div className={useDistributedRow ? 'flex-1 flex items-center justify-center gap-1.5' : 'contents'}>

        {/* REJECT BUTTON (R / 2) */}
        <button
          type="button"
          onClick={() => onStatus('rejected')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            actionBtnClass,
            floatingFillClass,
            isSidebar && 'order-1',
            status === 'rejected'
              ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-lg shadow-red-600/40'
              : 'bg-neutral-800/90 hover:bg-red-950/80 text-neutral-300 hover:text-red-200 border border-neutral-700/60 hover:border-red-600/50'
          )}
          title="Reject (R / 2)"
        >
          <X size={scaleClasses.iconSize} strokeWidth={2.5} />
          {showText && <span className="whitespace-nowrap font-medium text-xs">Reject</span>}
        </button>

        {/* SKIP BUTTON (Space) */}
        <button
          type="button"
          onClick={() => onStatus('pending')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            actionBtnClass,
            floatingFillClass,
            isSidebar && 'order-3',
            status === 'pending'
              ? 'bg-neutral-700 text-white ring-2 ring-neutral-400 shadow-md'
              : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700/60'
          )}
          title="Skip / Leave Pending (Space)"
        >
          <SkipForward size={scaleClasses.iconSize - 2} />
          {showText && <span className="whitespace-nowrap font-medium text-xs">Skip</span>}
        </button>

        {/* ACCEPT BUTTON (A / ~ / Enter) */}
        <button
          type="button"
          onClick={() => onStatus('accepted')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            actionBtnClass,
            floatingFillClass,
            isSidebar && 'order-2',
            status === 'accepted'
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-lg shadow-emerald-600/40'
              : 'bg-neutral-800/90 hover:bg-emerald-950/80 text-neutral-300 hover:text-emerald-200 border border-neutral-700/60 hover:border-emerald-600/50'
          )}
          title="Accept / Keep (A / ~ / Enter)"
        >
          <Check size={scaleClasses.iconSize} strokeWidth={2.5} />
          {showText && <span className="whitespace-nowrap font-medium text-xs">Accept</span>}
        </button>

        {/* OPTIONAL TAG BUTTON */}
        {onToggleTag && (
          <button
            type="button"
            onClick={onToggleTag}
            className={clsx(
              'rounded-xl transition-all cursor-pointer font-medium select-none',
              actionBtnClass,
              floatingFillClass,
              isSidebar && 'order-4',
              isTagged
                ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-300 font-bold'
                : 'bg-neutral-800/60 hover:bg-neutral-700 text-neutral-400 hover:text-amber-300 border border-neutral-700/60'
            )}
            title="Toggle Tag / Flag (\)"
          >
            <Bookmark size={scaleClasses.iconSize - 2} className={isTagged ? 'fill-current' : ''} />
            {showText && <span className="whitespace-nowrap font-medium text-xs">Tag</span>}
          </button>
        )}
        </div>

        {/* Right controls pinned to the bar's right edge: options menu + resize handle */}
        <div className={clsx(useDistributedRow ? 'flex items-center gap-1 shrink-0 ml-auto' : 'contents')}>
        {/* Placement & Scale Menu Button (menu renders via portal, fixed, so it can never be clipped) */}
        <div className={clsx('relative shrink-0', isSidebar && 'col-span-2 flex justify-center')}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (menuAnchor) {
                setMenuAnchor(null)
              } else {
                const rect = e.currentTarget.getBoundingClientRect()
                setMenuAnchor({ x: rect.right, y: rect.top })
              }
            }}
            className="p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 rounded-lg cursor-pointer transition-colors"
            title="Action Bar Layout & Scale Options"
          >
            <MoreVertical size={13} />
          </button>

          {menuAnchor && createPortal(
            <>
              <div className="fixed inset-0 z-[9999]" onClick={() => setMenuAnchor(null)} />
              <div
                style={
                  placement === 'side-left'
                    ? {
                        position: 'fixed',
                        left: `${menuAnchor.x + 8}px`,
                        top: `${Math.max(10, Math.min(menuAnchor.y, window.innerHeight - 360))}px`,
                        zIndex: 10000,
                      }
                    : placement === 'side-right'
                    ? {
                        position: 'fixed',
                        right: `${Math.max(10, window.innerWidth - menuAnchor.x + 32)}px`,
                        top: `${Math.max(10, Math.min(menuAnchor.y, window.innerHeight - 360))}px`,
                        zIndex: 10000,
                      }
                    : {
                        position: 'fixed',
                        bottom: `${Math.max(10, window.innerHeight - menuAnchor.y + 8)}px`,
                        right: `${Math.max(10, window.innerWidth - menuAnchor.x)}px`,
                        zIndex: 10000,
                      }
                }
                className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[200px] select-none animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                  Placement
                </div>
                <button
                  onClick={() => handleUpdatePlacement('sidebar')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    placement === 'sidebar' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <PanelRight size={13} />
                  <span>Dock to Right Sidebar (📌)</span>
                </button>
                <button
                  onClick={() => handleUpdatePlacement('bottom')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    placement === 'bottom' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <ArrowDown size={13} />
                  <span>Dock to Bottom Line</span>
                </button>
                <button
                  onClick={() => handleUpdatePlacement('side-left')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    placement === 'side-left' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <ArrowLeft size={13} />
                  <span>Dock to Left Edge (Vertical)</span>
                </button>
                <button
                  onClick={() => handleUpdatePlacement('side-right')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    placement === 'side-right' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <ArrowRight size={13} />
                  <span>Dock to Right Edge (Vertical)</span>
                </button>
                <button
                  onClick={() => handleUpdatePlacement('floating')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    placement === 'floating' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <Move size={13} />
                  <span>Float Anywhere on Canvas</span>
                </button>

                <div className="px-3 py-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-t border-b border-neutral-800">
                  Scale / Size
                </div>
                <button
                  onClick={() => handleUpdateScale('compact')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    scale === 'compact' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <Minimize2 size={13} />
                  <span>Compact (Icon & key)</span>
                </button>
                <button
                  onClick={() => handleUpdateScale('standard')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    scale === 'standard' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <span>Standard</span>
                </button>
                <button
                  onClick={() => handleUpdateScale('large')}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors',
                    scale === 'large' ? 'text-blue-400 font-semibold' : 'text-neutral-300'
                  )}
                >
                  <Maximize2 size={13} />
                  <span>Large (Speed Triage Targets)</span>
                </button>

                {placement === 'floating' && Boolean(floatWidth) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFloatWidth(undefined)
                      setMenuAnchor(null)
                      try {
                        localStorage.removeItem('photo_culler_triage_float_width')
                      } catch {}
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-300 cursor-pointer border-t border-neutral-800"
                  >
                    <RotateCcw size={12} className="text-neutral-400" />
                    <span>Reset Bar Width</span>
                  </button>
                )}
              </div>
            </>,
            document.body
          )}
        </div>

        {/* Resize Handle for Floating Mode */}
        {placement === 'floating' && (
          <div
            data-resizable-handle="culling-float"
            onPointerDown={handleResizePointerDown}
            className="p-1 text-neutral-500 hover:text-blue-400 active:text-blue-300 rounded cursor-col-resize transition-colors shrink-0"
            title="Drag to resize action bar width"
          >
            <svg className="w-2.5 h-2.5 pointer-events-none" viewBox="0 0 10 10" fill="none">
              <path d="M8 2L2 8M8 5L5 8M8 8H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
