import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, XCircle, PanelBottom, PanelRight, ChevronDown, ChevronRight, GripVertical, Move, X, ArrowLeftRight } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'
import { preloadAndDecodeImage } from '../utils/imagePreloader'
import type { Photo } from '../types/photo'

type FilmstripPos = 'bottom' | 'side' | 'floating' | 'hidden'

type ThumbSize = 'compact' | 'standard' | 'large'
type StatusFilter = 'all' | 'pending' | 'accepted' | 'rejected'

const THUMB_SIZE_KEY = 'firstpass_filmstrip_thumb_size'
const THUMB_SIZE_LEGACY_KEY = 'photo_culler_filmstrip_thumb_size'

function loadThumbSize(): ThumbSize {
  try {
    const saved =
      localStorage.getItem(THUMB_SIZE_KEY) ?? localStorage.getItem(THUMB_SIZE_LEGACY_KEY)
    if (saved === 'compact' || saved === 'standard' || saved === 'large') return saved
  } catch {}
  return 'standard'
}

function storeThumbSize(size: ThumbSize): void {
  try {
    localStorage.setItem(THUMB_SIZE_KEY, size)
    localStorage.setItem(THUMB_SIZE_LEGACY_KEY, size)
  } catch {}
}

interface FilmstripProps {
  photos: Photo[]
  currentPhotoId: number
  position: 'bottom' | 'side' | 'floating'
  onSelectPhoto: (photoId: number) => void
  onTogglePosition?: () => void
  onSetPosition?: (pos: FilmstripPos) => void
  onClose: () => void
  /** When true, fills the unified side-by-side bottom bar height instead of a fixed h-28. */
  fillHeight?: boolean
  onStartDrag?: (e: React.PointerEvent) => void
  /** Swap modules / filmstrip sides in the unified bottom dock. */
  onSwapSides?: () => void
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-neutral-500'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-rose-400'
}

export default function Filmstrip({
  photos,
  currentPhotoId,
  position,
  onSelectPhoto,
  onTogglePosition,
  onSetPosition,
  onClose,
  fillHeight = false,
  onStartDrag,
  onSwapSides,
}: FilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeThumbRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [thumbSize, setThumbSize] = useState<ThumbSize>(loadThumbSize)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const handleSetThumbSize = (size: ThumbSize) => {
    setThumbSize(size)
    storeThumbSize(size)
  }

  const statusCounts = useMemo(() => {
    let pending = 0
    let accepted = 0
    let rejected = 0
    for (const p of photos) {
      if (p.status === 'accepted') accepted += 1
      else if (p.status === 'rejected') rejected += 1
      else pending += 1
    }
    return { all: photos.length, pending, accepted, rejected }
  }, [photos])

  const visiblePhotos = useMemo(() => {
    if (statusFilter === 'all') return photos
    return photos.filter((p) => p.status === statusFilter)
  }, [photos, statusFilter])

  const handleChipClick = (filter: StatusFilter) => {
    if (statusFilter !== filter) {
      setStatusFilter(filter)
      return
    }
    // Clicking the active chip jumps to the first photo of that status.
    const first =
      filter === 'all' ? photos[0] : photos.find((p) => p.status === filter)
    if (first) onSelectPhoto(first.id)
  }

  // Compact `h-16 w-20`, Standard `h-20 w-24`, Large `h-24 w-30`
  const thumbClass =
    thumbSize === 'compact'
      ? 'h-16 w-20'
      : thumbSize === 'large'
        ? 'h-24 w-30'
        : 'h-20 w-24'

  // Auto-scroll the active thumbnail into view
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [currentPhotoId, position, statusFilter])

  // Close the options menu on outside click / Escape
  useEffect(() => {
    if (!showMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [showMenu])

  const isBottom = position === 'bottom'
  const isSide = position === 'side'
  const isFloating = position === 'floating'
  // Floating renders horizontally like the bottom dock, filling its DraggablePanel body.
  const isHorizontal = !isSide

  const setPos = (pos: FilmstripPos) => {
    setShowMenu(false)
    if (onSetPosition) onSetPosition(pos)
    else if (pos === 'hidden') onClose()
    else onTogglePosition?.()
  }

  return (
    <div
      className={clsx(
        'bg-neutral-950/95 backdrop-blur border-neutral-800 z-30 transition-all duration-200 flex flex-col',
        isFloating
          ? 'w-full h-full min-h-0 border-0 flex-shrink-0 overflow-hidden'
          : isBottom
            ? fillHeight
              ? 'w-full h-full min-h-[90px] border rounded-xl flex-shrink-0 overflow-hidden'
              : 'w-full h-28 border-t flex-shrink-0'
            : 'h-full w-36 border-l flex-shrink-0'
      )}
    >
      {/* Header toolbar (h-8 to match the modules pane headers) */}
      <div
        className="flex items-center justify-between px-3 h-8 shrink-0 bg-neutral-950/80 border-b border-neutral-800 text-[11px] text-neutral-400 select-none relative"
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowMenu(true)
        }}
      >
        <div className="flex items-center gap-1 font-medium min-w-0">
          <div
            data-drag-handle
            onPointerDown={onStartDrag}
            className="p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 rounded cursor-grab active:cursor-grabbing transition-colors shrink-0"
            title="Drag to move filmstrip (drag away to float, drag near bottom/side to dock)"
          >
            <GripVertical size={13} />
          </div>
          <span>Filmstrip</span>
          <span className="text-neutral-500">
            ({photos.findIndex((p) => p.id === currentPhotoId) + 1}/{photos.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Thumbnail density toggle */}
          <div
            className="flex items-center rounded-md border border-neutral-800 overflow-hidden mr-1"
            title="Thumbnail size"
          >
            {(['compact', 'standard', 'large'] as ThumbSize[]).map((size) => (
              <button
                key={size}
                onClick={() => handleSetThumbSize(size)}
                className={clsx(
                  'px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer',
                  thumbSize === size
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800'
                )}
                title={
                  size === 'compact'
                    ? 'Compact thumbnails (h-16 w-20)'
                    : size === 'large'
                      ? 'Large thumbnails (h-24 w-30)'
                      : 'Standard thumbnails (h-20 w-24)'
                }
              >
                {size === 'compact' ? 'S' : size === 'large' ? 'L' : 'M'}
              </button>
            ))}
          </div>
          {onSwapSides && (
            <button
              onClick={onSwapSides}
              className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Swap sides: filmstrip ↔ modules"
            >
              <ArrowLeftRight size={13} />
            </button>
          )}
          {!isFloating && (
            <button
              onClick={() => setPos('floating')}
              className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Float window (moveable)"
            >
              <Move size={13} />
            </button>
          )}
          {!isBottom && (
            <button
              onClick={() => setPos('bottom')}
              className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Dock to bottom"
            >
              <PanelBottom size={13} />
            </button>
          )}
          {!isSide && (
            <button
              onClick={() => setPos('side')}
              className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Dock to right side"
            >
              <PanelRight size={13} />
            </button>
          )}
          {onTogglePosition && !onSetPosition && (
            <button
              onClick={onTogglePosition}
              className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title={isBottom ? 'Dock to right side' : 'Dock to bottom'}
            >
              {isBottom ? <PanelRight size={13} /> : <PanelBottom size={13} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Hide filmstrip (B)"
          >
            {isFloating ? <X size={13} /> : isBottom ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {/* Right-click / options menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute right-1 top-full mt-1 w-52 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
              Filmstrip Placement
            </div>
            <button
              onClick={() => setPos('bottom')}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer hover:bg-white/5',
                isBottom ? 'text-blue-400 font-semibold' : 'text-neutral-300'
              )}
            >
              <PanelBottom size={13} className="shrink-0" />
              <span>Dock to Bottom Stage</span>
            </button>
            <button
              onClick={() => setPos('side')}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer hover:bg-white/5',
                isSide ? 'text-blue-400 font-semibold' : 'text-neutral-300'
              )}
            >
              <PanelRight size={13} className="shrink-0" />
              <span>Dock to Right Sidebar</span>
            </button>
            <button
              onClick={() => setPos('floating')}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer hover:bg-white/5',
                isFloating ? 'text-blue-400 font-semibold' : 'text-neutral-300'
              )}
            >
              <Move size={13} className="shrink-0" />
              <span>Float Freely on Screen</span>
            </button>
            <div className="my-1 border-t border-neutral-800" />
            <button
              onClick={() => setPos('hidden')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-neutral-300 transition-colors cursor-pointer hover:bg-white/5"
            >
              <X size={13} className="shrink-0" />
              <span>Hide Filmstrip (B)</span>
            </button>
          </div>
        )}
      </div>

      {/* Status filter quick-chips */}
      <div className="flex items-center gap-1 px-2 py-1 shrink-0 border-b border-neutral-800/60 bg-neutral-950/60 overflow-x-auto scrollbar-none">
        {(['all', 'pending', 'accepted', 'rejected'] as StatusFilter[]).map((filter) => {
          const isActive = statusFilter === filter
          const count = statusCounts[filter]
          return (
            <button
              key={filter}
              onClick={() => handleChipClick(filter)}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer border',
                isActive
                  ? filter === 'accepted'
                    ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300'
                    : filter === 'rejected'
                      ? 'bg-rose-600/20 border-rose-500/60 text-rose-300'
                      : filter === 'pending'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-200 hover:border-neutral-600'
              )}
              title={
                isActive
                  ? `Showing ${filter} — click again to jump to first ${filter} photo`
                  : `Filter filmstrip to ${filter} photos`
              }
            >
              <span className="capitalize">{filter}</span>
              <span className="font-mono opacity-80">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Thumbnails list */}
      <div
        ref={containerRef}
        className={clsx(
          'flex-1 p-2 gap-2 overflow-auto scrollbar-thin scrollbar-thumb-neutral-700',
          isHorizontal ? 'flex flex-row items-center overflow-x-auto overflow-y-hidden' : 'flex flex-col items-center overflow-y-auto overflow-x-hidden'
        )}
      >
        {visiblePhotos.map((photo) => {
          const isActive = photo.id === currentPhotoId
          return (
            <button
              key={photo.id}
              ref={isActive ? activeThumbRef : null}
              onClick={() => onSelectPhoto(photo.id)}
              onMouseEnter={() => preloadAndDecodeImage(api.getFullImageUrl(photo.id))}
              className={clsx(
                'relative group flex-shrink-0 rounded-lg overflow-hidden transition-all duration-150 cursor-pointer bg-neutral-900 border-2',
                thumbClass,
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/20 scale-105 z-10'
                  : 'border-neutral-800 hover:border-neutral-600 opacity-75 hover:opacity-100'
              )}
              title={photo.filename}
            >
              {/* Image */}
              <img
                src={api.getThumbnailUrl(photo.id)}
                alt={photo.filename}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />

              {/* Status Indicator (top-right) */}
              <div className="absolute top-1 right-1 flex items-center gap-0.5 z-10">
                {photo.status === 'accepted' && (
                  <div className="w-3.5 h-3.5 bg-emerald-600 rounded-full flex items-center justify-center shadow">
                    <CheckCircle2 size={10} className="text-white" />
                  </div>
                )}
                {photo.status === 'rejected' && (
                  <div className="w-3.5 h-3.5 bg-rose-600 rounded-full flex items-center justify-center shadow">
                    <XCircle size={10} className="text-white" />
                  </div>
                )}
              </div>

              {/* Tagged badge (top-left) */}
              {photo.is_tagged && (
                <div
                  className="absolute top-1 left-1 bg-amber-500 text-black text-[9px] px-1 py-0.2 rounded font-black shadow z-10"
                  title="Tagged (\)"
                >
                  🏷️
                </div>
              )}

              {/* Score / Filename Footer (bottom) */}
              <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 flex items-center justify-between text-[9px] font-mono text-neutral-300">
                <span className="truncate max-w-[50px] text-[8px] text-neutral-400">
                  {photo.filename.replace(/\.[^/.]+$/, '')}
                </span>
                {photo.overall_score !== null && (
                  <span className={clsx('font-bold ml-auto', scoreColor(photo.overall_score))}>
                    {Math.round(photo.overall_score)}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
