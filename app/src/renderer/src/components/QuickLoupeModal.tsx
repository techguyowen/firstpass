import React, { useState, useCallback, useEffect } from 'react'
import { X, CheckCircle2, XCircle, ArrowLeft, ArrowRight, Maximize2, ZoomIn, ZoomOut, Crown, Users } from 'lucide-react'
import type { Photo } from '../types/photo'
import { api } from '../api/client'
import { FaceLoupe } from './FaceLoupe'
import clsx from 'clsx'
import FirstPassLoader from './FirstPassLoader'

interface Props {
  photo: Photo
  onClose: () => void
  onAccept: () => void
  onReject: () => void
  onNext: () => void
  onPrev: () => void
  onOpenReview: () => void
}

export default function QuickLoupeModal({
  photo,
  onClose,
  onAccept,
  onReject,
  onNext,
  onPrev,
  onOpenReview,
}: Props) {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
  const [imgLoaded, setImgLoaded] = useState(false)

  // Reset zoom on photo change
  useEffect(() => {
    setZoomLevel(1)
    setZoomOrigin({ x: 50, y: 50 })
    setImgLoaded(false)
  }, [photo.id])

  const handleSelectFace = useCallback((box: [number, number, number, number]) => {
    if (!photo || !photo.width || !photo.height) return
    const [bx, by, bw, bh] = box
    const cx = Math.max(5, Math.min(95, ((bx + bw / 2) / photo.width) * 100))
    const cy = Math.max(5, Math.min(95, ((by + bh / 2) / photo.height) * 100))
    setZoomOrigin({ x: cx, y: cy })
    setZoomLevel(2.8)
  }, [photo])

  const handleToggleZoom = useCallback(() => {
    if (zoomLevel > 1) {
      setZoomLevel(1)
      setZoomOrigin({ x: 50, y: 50 })
    } else {
      setZoomLevel(2.5)
      setZoomOrigin({ x: 50, y: 50 })
    }
  }, [zoomLevel])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        onClose()
      } else if (['`', '~', '1', 'p', 'P', 'a', 'A'].includes(e.key)) {
        e.preventDefault()
        onAccept()
      } else if (['2', 'x', 'X', 'r', 'R'].includes(e.key)) {
        e.preventDefault()
        onReject()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onOpenReview()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleToggleZoom()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onAccept, onReject, onNext, onPrev, onOpenReview, handleToggleZoom])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top action header */}
      <div
        className="w-full max-w-6xl flex items-center justify-between z-10 px-2 py-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm truncate max-w-xs">{photo.filename}</span>
          {photo.is_burst_leader && (
            <span className="flex items-center gap-1 bg-amber-400 text-neutral-950 font-black text-[10px] px-2 py-0.5 rounded-full shadow-md">
              <Crown size={11} className="stroke-[2.5]" />
              HERO SHOT
            </span>
          )}
          {photo.overall_score !== null && (
            <span
              className={clsx(
                'text-white text-xs font-bold px-2 py-0.5 rounded shadow',
                photo.overall_score >= 70 ? 'bg-emerald-600' : photo.overall_score >= 40 ? 'bg-amber-600' : 'bg-rose-700'
              )}
            >
              Score: {Math.round(photo.overall_score)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick ratings */}
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
            title="Accept (1 or A)"
          >
            <CheckCircle2 size={14} />
            <span>Keep (1)</span>
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
            title="Reject (2 or R)"
          >
            <XCircle size={14} />
            <span>Reject (2)</span>
          </button>
          <button
            onClick={handleToggleZoom}
            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            title="Toggle 100% Zoom (Z)"
          >
            {zoomLevel > 1 ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
            <span>{zoomLevel > 1 ? '1x' : '100%'}</span>
          </button>
          <button
            onClick={onOpenReview}
            className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
            title="Open in Full Review (Enter)"
          >
            <Maximize2 size={13} />
            <span>Full Review</span>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer ml-2"
            title="Close Loupe (Space or Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Image Viewport with 100% Zoom Centering */}
      <div
        className="relative flex-1 w-full max-w-6xl flex items-center justify-center overflow-hidden my-2 rounded-xl bg-neutral-950 border border-neutral-800/80 cursor-zoom-in"
        onClick={(e) => {
          e.stopPropagation()
          handleToggleZoom()
        }}
      >
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <FirstPassLoader size="sm" label="Loading 100% preview..." />
          </div>
        )}

        <img
          src={api.getFullImageUrl(photo.id)}
          alt={photo.filename}
          onLoad={() => setImgLoaded(true)}
          className={clsx(
            'max-h-full max-w-full object-contain transition-transform duration-200 select-none pointer-events-none',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
            transform: `scale(${zoomLevel})`,
          }}
        />

        {/* Previous / Next Arrow Floats */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-lg hover:scale-110 cursor-pointer z-20"
          title="Previous Photo (←)"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-lg hover:scale-110 cursor-pointer z-20"
          title="Next Photo (→)"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Bottom Dock: Face Loupe Inspector */}
      <div
        className="w-full max-w-3xl z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <FaceLoupe photoId={photo.id} onSelectFace={handleSelectFace} />
        <p className="text-[10px] text-neutral-500 text-center mt-1.5 font-mono">
          SPACE: Exit · 1/A: Keep · 2/R: Reject · Z: 100% Zoom · [: Prev Face · ]: Next Face · ←/→: Switch
        </p>
      </div>
    </div>
  )
}
