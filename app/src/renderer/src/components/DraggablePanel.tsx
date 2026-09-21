import React, { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, Minus, Square, X, RotateCcw, PanelRight, Anchor, Maximize2 } from 'lucide-react'
import clsx from 'clsx'

export type DockZone = 'sidebar' | 'bottom'

export interface DraggablePanelProps {
  title: string
  icon?: React.ReactNode
  storageKey: string
  defaultPosition?: { x: number; y: number }
  children: React.ReactNode
  isOpen: boolean
  onClose?: () => void
  headerControls?: React.ReactNode
  width?: number | string
  height?: number | string
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  resizable?: boolean
  allowCollapse?: boolean
  className?: string
  supportedDockZones?: DockZone[]
  onSnapDock?: (zone: DockZone) => void
  onResize?: (size: { width: number; height?: number }) => void
}

let topZIndex = 50

type ResizeDirection = 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw'

function getPanelStorage(key: string): string | null {
  try {
    const val = localStorage.getItem(key)
    if (val !== null) return val
    if (key.startsWith('firstpass_')) {
      return localStorage.getItem(key.replace('firstpass_', 'photo_culler_'))
    }
  } catch {}
  return null
}

function setPanelStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    if (key.startsWith('firstpass_')) {
      localStorage.setItem(key.replace('firstpass_', 'photo_culler_'), value)
    }
  } catch {}
}

function removePanelStorage(key: string): void {
  try {
    localStorage.removeItem(key)
    if (key.startsWith('firstpass_')) {
      localStorage.removeItem(key.replace('firstpass_', 'photo_culler_'))
    }
  } catch {}
}

export default function DraggablePanel({
  title,
  icon,
  storageKey,
  defaultPosition = { x: 80, y: 80 },
  children,
  isOpen,
  onClose,
  headerControls,
  width = 320,
  height,
  minWidth = 240,
  minHeight = 100,
  maxWidth,
  maxHeight,
  resizable = true,
  allowCollapse = true,
  className,
  supportedDockZones = [],
  onSnapDock,
  onResize,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const animationFrameRef = useRef<number | null>(null)
  const activeHoveredZoneRef = useRef<DockZone | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const defaultW = typeof width === 'number' ? width : 320
  const defaultH = typeof height === 'number' ? height : undefined

  // Persisted panel dimensions
  const [size, setSize] = useState<{ width: number; height?: number }>(() => {
    try {
      const saved = getPanelStorage(`${storageKey}_size`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.width === 'number' && parsed.width >= minWidth) {
          return {
            width: Math.min(window.innerWidth - 20, parsed.width),
            height: typeof parsed.height === 'number' ? Math.min(window.innerHeight - 40, Math.max(minHeight, parsed.height)) : defaultH,
          }
        }
      }
    } catch {}
    return { width: defaultW, height: defaultH }
  })

  // Load persisted position and collapse state
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = getPanelStorage(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const maxX = Math.max(10, window.innerWidth - (typeof width === 'number' ? width : 300) - 20)
          const maxY = Math.max(10, window.innerHeight - 100)
          return {
            x: Math.min(maxX, Math.max(10, parsed.x)),
            y: Math.min(maxY, Math.max(10, parsed.y)),
          }
        }
      }
    } catch {}
    return defaultPosition
  })

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = getPanelStorage(`${storageKey}_collapsed`)
      return saved === 'true'
    } catch {
      return false
    }
  })

  const [zIndex, setZIndex] = useState<number>(() => ++topZIndex)

  const bringToFront = useCallback(() => {
    setZIndex(++topZIndex)
  }, [])

  // Drag handlers with Dock Zone proximity detection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('select')) return

    bringToFront()
    setContextMenu(null)
    isDraggingRef.current = true
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const panelW = panelRef.current?.offsetWidth || size.width
        const maxX = Math.max(10, window.innerWidth - panelW - 10)
        const maxY = Math.max(10, window.innerHeight - 60)

        const rawX = ev.clientX - dragOffsetRef.current.x
        const rawY = ev.clientY - dragOffsetRef.current.y

        const clampedX = Math.min(maxX, Math.max(10, rawX))
        const clampedY = Math.min(maxY, Math.max(10, rawY))

        setPosition({ x: clampedX, y: clampedY })

        // Proximity detection for dock drop zones (suppressed if Cmd or Ctrl is held)
        const isModifierHeld = ev.metaKey || ev.ctrlKey
        let detectedZone: DockZone | null = null

        if (!isModifierHeld) {
          // 1. Check DOM elements with data-dock-zone
          try {
            const elementsUnderPoint = document.elementsFromPoint(ev.clientX, ev.clientY)
            for (const el of elementsUnderPoint) {
              const zoneAttr = el.getAttribute('data-dock-zone') as DockZone | null
              if (zoneAttr && supportedDockZones.includes(zoneAttr)) {
                detectedZone = zoneAttr
                break
              }
            }
          } catch {}

          // 2. Coordinate fallback proximity
          if (!detectedZone && supportedDockZones.length > 0) {
            if (supportedDockZones.includes('sidebar') && ev.clientX >= window.innerWidth - 380 && ev.clientY >= 40 && ev.clientY <= window.innerHeight - 80) {
              detectedZone = 'sidebar'
            } else if (supportedDockZones.includes('bottom') && ev.clientY >= window.innerHeight - 150) {
              detectedZone = 'bottom'
            }
          }
        }

        if (detectedZone !== activeHoveredZoneRef.current) {
          activeHoveredZoneRef.current = detectedZone
          window.dispatchEvent(new CustomEvent('app:dock-hover', {
            detail: { zone: detectedZone, panelTitle: title }
          }))
        }
      })
    }

    const handleMouseUp = (ev: MouseEvent) => {
      isDraggingRef.current = false
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      const isModifierHeld = ev.metaKey || ev.ctrlKey
      let snapZone = isModifierHeld ? null : activeHoveredZoneRef.current

      // If snapZone is not yet set from RAF tick, evaluate immediately at release point
      if (!isModifierHeld && !snapZone && supportedDockZones.length > 0) {
        try {
          const elementsUnderPoint = document.elementsFromPoint(ev.clientX, ev.clientY)
          for (const el of elementsUnderPoint) {
            const zoneAttr = el.getAttribute('data-dock-zone') as DockZone | null
            if (zoneAttr && supportedDockZones.includes(zoneAttr)) {
              snapZone = zoneAttr
              break
            }
          }
        } catch {}

        if (!snapZone) {
          if (
            supportedDockZones.includes('sidebar') &&
            (ev.clientX >= window.innerWidth - 380 || ev.clientX <= 380) &&
            ev.clientY >= 40 &&
            ev.clientY <= window.innerHeight - 80
          ) {
            snapZone = 'sidebar'
          } else if (supportedDockZones.includes('bottom') && ev.clientY >= window.innerHeight - 150) {
            snapZone = 'bottom'
          }
        }
      }

      activeHoveredZoneRef.current = null
      window.dispatchEvent(new CustomEvent('app:dock-hover', { detail: { zone: null } }))

      if (snapZone && onSnapDock) {
        onSnapDock(snapZone)
        return
      }

      // Persist floating position on drop
      setPosition((curr) => {
        setPanelStorage(storageKey, JSON.stringify(curr))
        return curr
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Universal Resizing Handler (8 directions)
  const startResize = (e: React.PointerEvent, direction: ResizeDirection) => {
    e.preventDefault()
    e.stopPropagation()
    bringToFront()
    setContextMenu(null)

    isResizingRef.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = panelRef.current?.offsetWidth || size.width
    const startHeight = panelRef.current?.offsetHeight || (size.height || 220)
    const startPosX = position.x
    const startPosY = position.y

    const effectiveMinWidth = minWidth
    const effectiveMinHeight = minHeight
    const effectiveMaxWidth = maxWidth || Math.max(300, window.innerWidth - 20)
    const effectiveMaxHeight = maxHeight || Math.max(150, window.innerHeight - 40)

    document.body.style.userSelect = 'none'
    const originalCursor = document.body.style.cursor

    const cursorMap: Record<ResizeDirection, string> = {
      e: 'col-resize',
      w: 'col-resize',
      s: 'row-resize',
      n: 'row-resize',
      se: 'nwse-resize',
      sw: 'nesw-resize',
      ne: 'nesw-resize',
      nw: 'nwse-resize',
    }
    document.body.style.cursor = cursorMap[direction]

    let currentWidth = startWidth
    let currentHeight = startHeight
    let currentPosX = startPosX
    let currentPosY = startPosY

    const handlePointerMove = (ev: PointerEvent) => {
      if (!isResizingRef.current) return

      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY

      // Horizontal resize
      if (direction === 'e' || direction === 'se' || direction === 'ne') {
        currentWidth = Math.min(effectiveMaxWidth, Math.max(effectiveMinWidth, startWidth + deltaX))
      } else if (direction === 'w' || direction === 'sw' || direction === 'nw') {
        const potentialWidth = startWidth - deltaX
        if (potentialWidth >= effectiveMinWidth && potentialWidth <= effectiveMaxWidth) {
          currentWidth = potentialWidth
          currentPosX = startPosX + deltaX
        }
      }

      // Vertical resize
      if (direction === 's' || direction === 'se' || direction === 'sw') {
        currentHeight = Math.min(effectiveMaxHeight, Math.max(effectiveMinHeight, startHeight + deltaY))
      } else if (direction === 'n' || direction === 'ne' || direction === 'nw') {
        const potentialHeight = startHeight - deltaY
        if (potentialHeight >= effectiveMinHeight && potentialHeight <= effectiveMaxHeight) {
          currentHeight = potentialHeight
          currentPosY = startPosY + deltaY
        }
      }

      setSize({ width: currentWidth, height: currentHeight })
      if (currentPosX !== startPosX || currentPosY !== startPosY) {
        setPosition({ x: currentPosX, y: currentPosY })
      }
    }

    const handlePointerUp = () => {
      isResizingRef.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = originalCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)

      const finalSize = { width: currentWidth, height: currentHeight }
      setPanelStorage(`${storageKey}_size`, JSON.stringify(finalSize))
      if (currentPosX !== startPosX || currentPosY !== startPosY) {
        setPanelStorage(storageKey, JSON.stringify({ x: currentPosX, y: currentPosY }))
      }

      onResize?.(finalSize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      setPanelStorage(`${storageKey}_collapsed`, String(next))
      return next
    })
  }

  const handleResetPosition = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setPosition(defaultPosition)
    setContextMenu(null)
    setPanelStorage(storageKey, JSON.stringify(defaultPosition))
  }

  const handleResetSize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const defaultS = { width: defaultW, height: defaultH }
    setSize(defaultS)
    setContextMenu(null)
    removePanelStorage(`${storageKey}_size`)
    onResize?.(defaultS)
  }

  // Handle window resizing
  useEffect(() => {
    const handleWindowResize = () => {
      setPosition((curr) => {
        const panelW = panelRef.current?.offsetWidth || size.width
        const maxX = Math.max(10, window.innerWidth - panelW - 10)
        const maxY = Math.max(10, window.innerHeight - 60)
        return {
          x: Math.min(maxX, Math.max(10, curr.x)),
          y: Math.min(maxY, Math.max(10, curr.y)),
        }
      })
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [size.width])

  if (!isOpen) return null

  return (
    <>
      <div
        ref={panelRef}
        data-draggable-panel={storageKey}
        onMouseDown={bringToFront}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: isCollapsed ? 'auto' : (size.height ? `${size.height}px` : undefined),
          zIndex,
        }}
        className={clsx(
          'fixed select-none bg-neutral-950/95 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl overflow-hidden transition-shadow flex flex-col',
          'hover:border-neutral-700/90',
          className
        )}
      >
        {/* Titlebar / Drag Handle */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={allowCollapse ? toggleCollapse : undefined}
          onContextMenu={handleContextMenu}
          className="flex items-center justify-between px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800/80 cursor-grab active:cursor-grabbing text-xs text-neutral-300 select-none group shrink-0"
        >
          <div className="flex items-center gap-1.5 font-bold truncate">
            <GripVertical size={13} className="text-neutral-500 group-hover:text-neutral-300 transition-colors shrink-0" />
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </div>

          <div className="flex items-center gap-1 ml-2 shrink-0">
            {headerControls}

            {/* Reset position button */}
            <button
              onClick={handleResetPosition}
              className="p-1 text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Reset panel position to default"
            >
              <RotateCcw size={11} />
            </button>

            {/* Minimize / Roll up button */}
            {allowCollapse && (
              <button
                onClick={toggleCollapse}
                className="p-1 text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                title={isCollapsed ? 'Expand panel' : 'Roll up panel (Double-click titlebar)'}
              >
                {isCollapsed ? <Square size={10} /> : <Minus size={11} />}
              </button>
            )}

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 text-neutral-500 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Close panel"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Body content (hidden when collapsed) */}
        {!isCollapsed && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 p-3">
            {children}
          </div>
        )}

        {/* Universal Resize Handles (Active when uncollapsed and resizable) */}
        {!isCollapsed && resizable && (
          <>
            {/* Right edge */}
            <div
              data-resizable-handle="e"
              onPointerDown={(e) => startResize(e, 'e')}
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-30 transition-colors"
              title="Drag to resize width"
            />
            {/* Left edge */}
            <div
              data-resizable-handle="w"
              onPointerDown={(e) => startResize(e, 'w')}
              className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-30 transition-colors"
              title="Drag to resize width"
            />
            {/* Bottom edge */}
            <div
              data-resizable-handle="s"
              onPointerDown={(e) => startResize(e, 's')}
              className="absolute bottom-0 left-0 w-full h-2 cursor-row-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-30 transition-colors"
              title="Drag to resize height"
            />
            {/* Top edge */}
            <div
              data-resizable-handle="n"
              onPointerDown={(e) => startResize(e, 'n')}
              className="absolute top-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-30 transition-colors"
              title="Drag to resize height"
            />
            {/* Bottom-Right corner (prominent grip handle) */}
            <div
              data-resizable-handle="se"
              onPointerDown={(e) => startResize(e, 'se')}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-40 flex items-end justify-end p-0.5 group/corner"
              title="Drag to resize window width and height"
            >
              <svg className="w-2.5 h-2.5 text-neutral-600 group-hover/corner:text-blue-400 group-active/corner:text-blue-300 transition-colors pointer-events-none" viewBox="0 0 10 10" fill="none">
                <path d="M8 2L2 8M8 5L5 8M8 8H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            {/* Bottom-Left corner */}
            <div
              data-resizable-handle="sw"
              onPointerDown={(e) => startResize(e, 'sw')}
              className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-30"
              title="Drag to resize"
            />
            {/* Top-Right corner */}
            <div
              data-resizable-handle="ne"
              onPointerDown={(e) => startResize(e, 'ne')}
              className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-30"
              title="Drag to resize"
            />
            {/* Top-Left corner */}
            <div
              data-resizable-handle="nw"
              onPointerDown={(e) => startResize(e, 'nw')}
              className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-30"
              title="Drag to resize"
            />
          </>
        )}
      </div>

      {/* Titlebar Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[200px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 180, contextMenu.y),
              left: Math.min(window.innerWidth - 210, contextMenu.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
              {title} Window
            </div>

            {supportedDockZones.includes('sidebar') && onSnapDock && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onSnapDock('sidebar')
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <PanelRight size={13} className="text-blue-400" />
                <span>Dock to Inspector Sidebar</span>
              </button>
            )}

            {supportedDockZones.includes('bottom') && onSnapDock && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onSnapDock('bottom')
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <Anchor size={13} className="text-blue-400" />
                <span>Dock to Bottom Stage</span>
              </button>
            )}

            {resizable && (
              <button
                onClick={() => handleResetSize()}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <Maximize2 size={13} className="text-neutral-400" />
                <span>Reset Window Size</span>
              </button>
            )}

            <button
              onClick={() => handleResetPosition()}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <RotateCcw size={13} className="text-neutral-400" />
              <span>Reset Window Position</span>
            </button>

            {onClose && (
              <>
                <div className="border-t border-neutral-800 my-0.5" />
                <button
                  onClick={() => {
                    setContextMenu(null)
                    onClose()
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-rose-300 hover:text-rose-200 cursor-pointer"
                >
                  <X size={13} className="text-rose-400" />
                  <span>Close Panel</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
