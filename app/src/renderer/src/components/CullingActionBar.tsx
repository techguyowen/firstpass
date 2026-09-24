import React, { useState, useEffect, useRef } from 'react'
import {
  Check, X, SkipForward, Bookmark, GripVertical, MoreVertical,
  ArrowDown, ArrowLeft, ArrowRight, Move, Maximize2, Minimize2, PanelRight, RotateCcw
} from 'lucide-react'
import clsx from 'clsx'
import { dockDragManager } from '../utils/dockDragManager'

export type TriagePlacement = 'bottom' | 'side-left' | 'side-right' | 'floating' | 'sidebar'
export type TriageScale = 'compact' | 'standard' | 'large'

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
        if (!isNaN(val) && val >= 240 && val <= 1000) return val
      }
    } catch {}
    return undefined
  })

  const [showMenu, setShowMenu] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)

  // Sync controlled props
  useEffect(() => {
    if (controlledPlacement) setPlacement(controlledPlacement)
  }, [controlledPlacement])

  useEffect(() => {
    if (controlledScale) setScale(controlledScale)
  }, [controlledScale])

  const handleUpdatePlacement = (newPlacement: TriagePlacement) => {
    setPlacement(newPlacement)
    try {
      localStorage.setItem('photo_culler_triage_placement', newPlacement)
    } catch {}
    if (onSetPlacement) onSetPlacement(newPlacement)
    setShowMenu(false)
  }

  const handleUpdateScale = (newScale: TriageScale) => {
    setScale(newScale)
    try {
      localStorage.setItem('photo_culler_triage_scale', newScale)
    } catch {}
    if (onSetScale) onSetScale(newScale)
    setShowMenu(false)
  }

  // Pointer-based smooth dragging & docking to lines
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button:not([data-drag-handle])')) return

    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = false

    const handlePointerMove = (ev: PointerEvent) => {
      if (!pointerStartRef.current) return
      const dx = ev.clientX - pointerStartRef.current.x
      const dy = ev.clientY - pointerStartRef.current.y

      if (!isDraggingRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDraggingRef.current = true
        dockDragManager.startDrag(
          {
            type: 'sorting-bar',
            id: 'sorting-bar',
            title: 'Culling Action Bar',
            sourceZone: placement === 'bottom' ? 'bottom' : placement === 'floating' ? 'floating' : 'sidebar',
          },
          ev.clientX,
          ev.clientY
        )
      }

      if (isDraggingRef.current) {
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

      if (isDraggingRef.current) {
        isDraggingRef.current = false
        const drop = dockDragManager.endDrag()
        if (drop && drop.dropTarget) {
          if (drop.dropTarget.type === 'sidebar-dock') {
            handleUpdatePlacement('sidebar')
          } else if (drop.dropTarget.type === 'bottom-dock') {
            handleUpdatePlacement('bottom')
          } else if (drop.dropTarget.type === 'side-dock') {
            handleUpdatePlacement(drop.dropTarget.side === 'left' ? 'side-left' : 'side-right')
          } else {
            // Free float at mouse release
            handleUpdatePlacement('floating')
            const clampedX = Math.max(20, Math.min(window.innerWidth - 260, ev.clientX - 100))
            const clampedY = Math.max(60, Math.min(window.innerHeight - 90, ev.clientY - 25))
            const newPos = { x: clampedX, y: clampedY }
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
    const startWidth = barRef.current?.offsetWidth || 360

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX
      const newWidth = Math.min(1000, Math.max(260, startWidth + deltaX))
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

  // Scale configurations
  const scaleClasses = isSidebar ? {
    container: 'p-1 gap-1',
    btn: 'px-1.5 py-1 text-[11px] flex items-center justify-center gap-1',
    iconSize: 12,
    showText: true,
  } : {
    compact: {
      container: isVertical ? 'p-1.5 gap-1.5' : 'px-3 py-1.5 gap-2',
      btn: isVertical ? 'p-2 w-10 h-10 flex items-center justify-center' : 'px-3.5 py-1.5 text-xs flex items-center justify-center gap-1.5',
      iconSize: 15,
      showText: false,
    },
    standard: {
      container: isVertical ? 'p-2 gap-2' : 'px-4 py-2 gap-3',
      btn: isVertical ? 'py-2 px-1 w-16 h-13 flex flex-col items-center justify-center text-[10px] leading-tight gap-0.5' : 'px-5 py-2 text-sm flex items-center justify-center gap-2',
      iconSize: 16,
      showText: true,
    },
    large: {
      container: isVertical ? 'p-2.5 gap-2.5' : 'px-5 py-2.5 gap-3.5',
      btn: isVertical ? 'py-2.5 px-1.5 w-18 h-15 flex flex-col items-center justify-center text-xs font-semibold gap-1' : 'px-7 py-3 text-base font-semibold flex items-center justify-center gap-2.5',
      iconSize: 20,
      showText: true,
    },
  }[scale]

  return (
    <div
      ref={barRef}
      onContextMenu={(e) => {
        e.preventDefault()
        setShowMenu(true)
      }}
      className={clsx(
        'select-none transition-all duration-200 z-40',
        isDimmed && 'opacity-30 hover:opacity-100',
        placement === 'sidebar' && 'w-full py-1.5 px-1 flex-shrink-0',
        placement === 'bottom' && 'flex items-center justify-center py-2 flex-shrink-0',
        placement === 'side-left' && 'absolute left-4 top-1/2 -translate-y-1/2',
        placement === 'side-right' && 'absolute right-4 top-1/2 -translate-y-1/2',
        placement === 'floating' && 'fixed'
      )}
      style={
        placement === 'floating'
          ? {
              left: `${floatPos.x}px`,
              top: `${floatPos.y}px`,
              width: floatWidth ? `${floatWidth}px` : undefined,
            }
          : undefined
      }
    >
      <div
        className={clsx(
          'flex items-center bg-neutral-900/90 backdrop-blur-md border border-neutral-800/90 rounded-2xl shadow-2xl transition-all',
          (placement === 'sidebar' || (placement === 'floating' && Boolean(floatWidth))) && 'w-full justify-between',
          isVertical ? 'flex-col' : 'flex-row',
          scaleClasses.container
        )}
      >
        {/* Drag Grip Handle */}
        <div
          data-drag-handle
          onPointerDown={handlePointerDown}
          className="p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 rounded-lg cursor-grab active:cursor-grabbing transition-colors shrink-0"
          title="Drag to right sidebar, bottom line, side edges, or float anywhere"
        >
          <GripVertical size={13} />
        </div>

        {/* REJECT BUTTON (R / 2) */}
        <button
          type="button"
          onClick={() => onStatus('rejected')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            scaleClasses.btn,
            (placement === 'sidebar' || (placement === 'floating' && Boolean(floatWidth))) && 'flex-1 min-w-0',
            status === 'rejected'
              ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-lg shadow-red-600/40'
              : 'bg-neutral-800/90 hover:bg-red-950/80 text-neutral-300 hover:text-red-200 border border-neutral-700/60 hover:border-red-600/50'
          )}
          title="Reject (R / 2)"
        >
          <X size={scaleClasses.iconSize} strokeWidth={2.5} />
          {scaleClasses.showText && <span className="truncate">Reject</span>}
        </button>

        {/* SKIP BUTTON (Space) */}
        <button
          type="button"
          onClick={() => onStatus('pending')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            scaleClasses.btn,
            (placement === 'sidebar' || (placement === 'floating' && Boolean(floatWidth))) && 'flex-1 min-w-0',
            status === 'pending'
              ? 'bg-neutral-700 text-white ring-2 ring-neutral-400 shadow-md'
              : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700/60'
          )}
          title="Skip / Leave Pending (Space)"
        >
          <SkipForward size={scaleClasses.iconSize - 2} />
          {scaleClasses.showText && <span className="truncate">Skip</span>}
        </button>

        {/* ACCEPT BUTTON (A / ~ / Enter) */}
        <button
          type="button"
          onClick={() => onStatus('accepted')}
          className={clsx(
            'rounded-xl transition-all cursor-pointer font-medium select-none',
            scaleClasses.btn,
            (placement === 'sidebar' || (placement === 'floating' && Boolean(floatWidth))) && 'flex-1 min-w-0',
            status === 'accepted'
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-lg shadow-emerald-600/40'
              : 'bg-neutral-800/90 hover:bg-emerald-950/80 text-neutral-300 hover:text-emerald-200 border border-neutral-700/60 hover:border-emerald-600/50'
          )}
          title="Accept / Keep (A / ~ / Enter)"
        >
          <Check size={scaleClasses.iconSize} strokeWidth={2.5} />
          {scaleClasses.showText && <span className="truncate">Accept</span>}
        </button>

        {/* OPTIONAL TAG BUTTON */}
        {onToggleTag && (
          <button
            type="button"
            onClick={onToggleTag}
            className={clsx(
              'rounded-xl transition-all cursor-pointer font-medium select-none',
              scaleClasses.btn,
              (placement === 'sidebar' || (placement === 'floating' && Boolean(floatWidth))) && 'flex-1 min-w-0',
              isTagged
                ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-300 font-bold'
                : 'bg-neutral-800/60 hover:bg-neutral-700 text-neutral-400 hover:text-amber-300 border border-neutral-700/60'
            )}
            title="Toggle Tag / Flag (\)"
          >
            <Bookmark size={scaleClasses.iconSize - 2} className={isTagged ? 'fill-current' : ''} />
            {scaleClasses.showText && <span className="truncate">Tag</span>}
          </button>
        )}

        {/* Placement & Scale Menu Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 rounded-lg cursor-pointer transition-colors"
            title="Action Bar Layout & Scale Options"
          >
            <MoreVertical size={13} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)} />
              <div
                className={clsx(
                  "absolute bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[200px] z-50 select-none animate-in fade-in zoom-in-95 duration-100",
                  placement === 'side-left'
                    ? "left-full ml-3 bottom-0"
                    : placement === 'side-right'
                    ? "right-full mr-3 bottom-0"
                    : "right-0 bottom-full mb-2"
                )}
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
                      setShowMenu(false)
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
            </>
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
  )
}
