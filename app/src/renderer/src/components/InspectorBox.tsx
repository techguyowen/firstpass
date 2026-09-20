import React, { useState, useRef } from 'react'
import { GripVertical, ChevronDown, ChevronRight, ChevronUp, ExternalLink, Anchor } from 'lucide-react'
import clsx from 'clsx'

export interface InspectorBoxProps {
  id: string
  title: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  isCollapsed: boolean
  onToggleCollapse: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onDragStart?: (id: string, e: React.DragEvent) => void
  onDragOver?: (id: string, e: React.DragEvent) => void
  onDrop?: (targetId: string, e: React.DragEvent) => void
  isDragging?: boolean
  isDragOver?: boolean
  onUndock?: () => void
  onDockToBottom?: () => void
  onDockToSidebar?: () => void
  undockTitle?: string
  children: React.ReactNode
}

export default function InspectorBox({
  id,
  title,
  icon,
  badge,
  isCollapsed,
  onToggleCollapse,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging = false,
  isDragOver = false,
  onUndock,
  onDockToBottom,
  onDockToSidebar,
  undockTitle = 'Float panel as draggable window',
  children,
}: InspectorBoxProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const tearOffStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleDragStart = (e: React.DragEvent) => {
    // Set standard plain text identifier for drag-and-drop
    e.dataTransfer.setData('text/plain', `inspector-box:${id}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    if (onDragStart) onDragStart(id, e)
    window.dispatchEvent(new CustomEvent('app:inspector-drag-start', { detail: { id, title } }))
  }

  const handleDragEnd = () => {
    window.dispatchEvent(new CustomEvent('app:inspector-drag-end'))
    window.dispatchEvent(new CustomEvent('app:dock-hover', { detail: { zone: null } }))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (onDragOver) onDragOver(id, e)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (onDrop) onDrop(id, e)
  }

  // Pointer tear-off fallback: dragging horizontally or vertically away from sidebar triggers float or bottom dock
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return
    if (e.button !== 0) return

    tearOffStartRef.current = { x: e.clientX, y: e.clientY }

    const handlePointerMove = (ev: PointerEvent) => {
      if (!tearOffStartRef.current) return
      const deltaX = Math.abs(ev.clientX - tearOffStartRef.current.x)
      const deltaY = Math.abs(ev.clientY - tearOffStartRef.current.y)

      if (deltaX > 25 || deltaY > 25) {
        if (ev.clientY >= window.innerHeight - 160) {
          window.dispatchEvent(new CustomEvent('app:dock-hover', { detail: { zone: 'bottom', moduleId: id } }))
        } else if (deltaX > 35) {
          window.dispatchEvent(new CustomEvent('app:dock-hover', { detail: { zone: 'canvas', moduleId: id } }))
        }
      }
    }

    const handlePointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.dispatchEvent(new CustomEvent('app:dock-hover', { detail: { zone: null } }))

      if (!tearOffStartRef.current) return
      const deltaX = Math.abs(ev.clientX - tearOffStartRef.current.x)
      const deltaY = Math.abs(ev.clientY - tearOffStartRef.current.y)
      tearOffStartRef.current = null

      // Check if dragged far enough
      if (deltaX > 35 || deltaY > 35) {
        if (ev.clientY >= window.innerHeight - 160 && onDockToBottom) {
          onDockToBottom()
        } else if (deltaX > 35 && onUndock) {
          onUndock()
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={clsx(
          'rounded-xl border transition-all duration-200 overflow-hidden select-none mb-2.5',
          isDragging && 'opacity-40 scale-[0.99] border-blue-500/50 dashed',
          isDragOver && !isDragging
            ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-950/20'
            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700/80 shadow-sm'
        )}
      >
        {/* Box Header */}
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onPointerDown={handlePointerDown}
          onContextMenu={handleContextMenu}
          className={clsx(
            'flex items-center justify-between px-2.5 py-2 cursor-grab active:cursor-grabbing transition-colors group/boxheader select-none',
            isCollapsed ? 'bg-neutral-900/40 hover:bg-neutral-900/70' : 'bg-neutral-900/80 border-b border-neutral-800/80'
          )}
          onDoubleClick={onToggleCollapse}
          title="Drag onto canvas to float window, or double-click to minimize"
        >
          {/* Left: Drag grip & Icon & Title */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
            {/* Grip handle for drag-and-drop & tear-off */}
            <div
              className="p-1 -ml-1 text-neutral-500 hover:text-neutral-200 rounded hover:bg-neutral-800 transition-colors shrink-0"
              title="Drag onto canvas to float, or drag to bottom to dock"
            >
              <GripVertical size={13} />
            </div>

            {icon && <span className="shrink-0 text-neutral-400">{icon}</span>}

            <span className="text-xs font-semibold text-neutral-200 truncate tracking-wide">
              {title}
            </span>
          </div>

          {/* Right: Badge, Hover Action Buttons & Collapse Toggle */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {badge && <span className="shrink-0 group-hover/boxheader:hidden">{badge}</span>}

            <div className="hidden group-hover/boxheader:flex items-center gap-0.5 animate-in fade-in duration-100">
              {/* Dock to Bottom Bar Button */}
              {onDockToBottom && (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDockToBottom()
                  }}
                  className="p-1 rounded text-neutral-500 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Dock panel to Bottom Stage Bar"
                >
                  <Anchor size={11} />
                </button>
              )}

              {/* Undock / Tear-Off Button */}
              {onUndock && (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation()
                    onUndock()
                  }}
                  className="p-1 rounded text-neutral-500 hover:text-blue-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                  title={undockTitle}
                >
                  <ExternalLink size={11} />
                </button>
              )}

              {/* Move Up Button */}
              {onMoveUp && (
                <button
                  type="button"
                  draggable={false}
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className={clsx(
                    'p-1 rounded text-neutral-500 transition-colors',
                    canMoveUp ? 'hover:text-white hover:bg-neutral-800 cursor-pointer' : 'opacity-20 cursor-default'
                  )}
                  title="Move box up"
                >
                  <ChevronUp size={12} />
                </button>
              )}

              {/* Move Down Button */}
              {onMoveDown && (
                <button
                  type="button"
                  draggable={false}
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className={clsx(
                    'p-1 rounded text-neutral-500 transition-colors',
                    canMoveDown ? 'hover:text-white hover:bg-neutral-800 cursor-pointer' : 'opacity-20 cursor-default'
                  )}
                  title="Move box down"
                >
                  <ChevronDown size={12} />
                </button>
              )}
            </div>

            {/* Collapse / Expand chevron */}
            <button
              type="button"
              draggable={false}
              onClick={onToggleCollapse}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand section' : 'Collapse section'}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* Box Body */}
        {!isCollapsed && (
          <div className="p-3 text-xs">
            {children}
          </div>
        )}
      </div>

      {/* Box Header Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[190px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 150, contextMenu.y),
              left: Math.min(window.innerWidth - 190, contextMenu.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
              {title} Module
            </div>

            {onUndock && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onUndock()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
              >
                <ExternalLink size={13} className="text-blue-400" />
                <span>Float as Movable Window</span>
              </button>
            )}

            {onDockToBottom && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onDockToBottom()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
              >
                <Anchor size={13} className="text-blue-400" />
                <span>Dock to Bottom Stage Bar</span>
              </button>
            )}

            {onDockToSidebar && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onDockToSidebar()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <span>Dock into Inspector Sidebar</span>
              </button>
            )}

            {onMoveUp && canMoveUp && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onMoveUp()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <ChevronUp size={13} className="text-neutral-400" />
                <span>Move Up in Inspector</span>
              </button>
            )}

            {onMoveDown && canMoveDown && (
              <button
                onClick={() => {
                  setContextMenu(null)
                  onMoveDown()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <ChevronDown size={13} className="text-neutral-400" />
                <span>Move Down in Inspector</span>
              </button>
            )}

            <button
              onClick={() => {
                setContextMenu(null)
                onToggleCollapse()
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              {isCollapsed ? <ChevronDown size={13} className="text-neutral-400" /> : <ChevronRight size={13} className="text-neutral-400" />}
              <span>{isCollapsed ? 'Expand Box' : 'Collapse Box'}</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}
