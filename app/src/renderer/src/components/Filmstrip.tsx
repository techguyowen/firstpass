import { useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, PanelBottom, PanelRight, ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'
import { preloadAndDecodeImage } from '../utils/imagePreloader'
import type { Photo } from '../types/photo'

interface FilmstripProps {
  photos: Photo[]
  currentPhotoId: number
  position: 'bottom' | 'side'
  onSelectPhoto: (photoId: number) => void
  onTogglePosition: () => void
  onClose: () => void
  /** When true, fills the unified side-by-side bottom bar height instead of a fixed h-28. */
  fillHeight?: boolean
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
  onClose,
  fillHeight = false,
}: FilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeThumbRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll the active thumbnail into view
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [currentPhotoId, position])

  const isBottom = position === 'bottom'

  return (
    <div
      className={clsx(
        'bg-neutral-950/95 backdrop-blur border-neutral-800 z-30 transition-all duration-200 flex flex-col',
        isBottom
          ? fillHeight
            ? 'w-full h-full min-h-[90px] border rounded-xl flex-shrink-0 overflow-hidden'
            : 'w-full h-28 border-t flex-shrink-0'
          : 'h-full w-36 border-l flex-shrink-0'
      )}
    >
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-neutral-900/80 border-b border-neutral-800/60 text-[11px] text-neutral-400 select-none">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Filmstrip</span>
          <span className="text-neutral-500">
            ({photos.findIndex((p) => p.id === currentPhotoId) + 1}/{photos.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePosition}
            className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            title={isBottom ? 'Dock to right side' : 'Dock to bottom'}
          >
            {isBottom ? <PanelRight size={13} /> : <PanelBottom size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Hide filmstrip (B)"
          >
            {isBottom ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Thumbnails list */}
      <div
        ref={containerRef}
        className={clsx(
          'flex-1 p-2 gap-2 overflow-auto scrollbar-thin scrollbar-thumb-neutral-700',
          isBottom ? 'flex flex-row items-center overflow-x-auto overflow-y-hidden' : 'flex flex-col items-center overflow-y-auto overflow-x-hidden'
        )}
      >
        {photos.map((photo) => {
          const isActive = photo.id === currentPhotoId
          return (
            <button
              key={photo.id}
              ref={isActive ? activeThumbRef : null}
              onClick={() => onSelectPhoto(photo.id)}
              onMouseEnter={() => preloadAndDecodeImage(api.getFullImageUrl(photo.id))}
              className={clsx(
                'relative group flex-shrink-0 rounded-lg overflow-hidden transition-all duration-150 cursor-pointer bg-neutral-900 border-2',
                isBottom ? 'h-20 w-24' : 'w-28 h-20',
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
