import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Check, XCircle, RotateCcw, Wind, Eye } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import type { Photo } from '../types/photo'

interface BurstGroupModalProps {
  burstGroupId: string
  burstPhotos: Photo[]
  onClose: () => void
  onStatusChange: (photoId: number, status: 'accepted' | 'rejected' | 'pending') => void
}

const API_BASE = 'http://localhost:58765'

function scoreBadgeClass(score: number | null): string {
  if (score === null) return 'bg-neutral-700 text-neutral-300'
  if (score > 70) return 'bg-green-700 text-green-100'
  if (score > 40) return 'bg-yellow-700 text-yellow-100'
  return 'bg-red-800 text-red-100'
}

function statusRingClass(status: 'pending' | 'accepted' | 'rejected'): string {
  if (status === 'accepted') return 'ring-2 ring-emerald-500'
  if (status === 'rejected') return 'ring-2 ring-rose-500'
  return 'ring-1 ring-neutral-600'
}

export default function BurstGroupModal({
  burstGroupId,
  burstPhotos,
  onClose,
  onStatusChange,
}: BurstGroupModalProps) {
  const navigate = useNavigate()
  const [focusedIndex, setFocusedIndex] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Keyboard handler
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          e.preventDefault()
          setFocusedIndex((i) => Math.max(0, i - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          setFocusedIndex((i) => Math.min(burstPhotos.length - 1, i + 1))
          break
        case '`':
        case '~':
        case '1':
        case 'p':
        case 'P':
        case 'a':
        case 'A': {
          const photo = burstPhotos[focusedIndex]
          if (photo) onStatusChange(photo.id, 'accepted')
          break
        }
        case 'r':
        case 'R': {
          const photo = burstPhotos[focusedIndex]
          if (photo) onStatusChange(photo.id, 'rejected')
          break
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [focusedIndex, burstPhotos, onClose, onStatusChange])

  // Scroll focused card into view
  useEffect(() => {
    cardRefs.current[focusedIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [focusedIndex])

  function handlePickBest() {
    if (burstPhotos.length === 0) return
    const best = burstPhotos.reduce((prev, cur) =>
      (cur.overall_score ?? -Infinity) > (prev.overall_score ?? -Infinity) ? cur : prev
    )
    burstPhotos.forEach((p) => {
      onStatusChange(p.id, p.id === best.id ? 'accepted' : 'rejected')
    })
    toast.success(`Best frame selected: ${best.filename}`)
  }

  function handleAcceptAll() {
    burstPhotos.forEach((p) => onStatusChange(p.id, 'accepted'))
    toast.success('All burst frames accepted')
  }

  function handleRejectAll() {
    burstPhotos.forEach((p) => onStatusChange(p.id, 'rejected'))
    toast('All burst frames rejected', { icon: '✕' })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`Burst sequence: ${burstPhotos.length} frames`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <h2 className="text-white font-semibold text-lg">
          Burst Sequence —{' '}
          <span className="text-neutral-400 font-normal">{burstPhotos.length} frames</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePickBest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            <Check size={14} />
            Pick Best
          </button>
          <button
            onClick={handleAcceptAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
          >
            Accept All
          </button>
          <button
            onClick={handleRejectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium transition-colors"
          >
            Reject All
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable strip */}
      <div
        ref={stripRef}
        className="flex-1 flex items-center overflow-x-auto overflow-y-hidden px-6 py-6 gap-4 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
      >
        {burstPhotos.map((photo, idx) => (
          <div
            key={photo.id}
            ref={(el) => { cardRefs.current[idx] = el }}
            onClick={() => setFocusedIndex(idx)}
            className={clsx(
              'relative flex-shrink-0 flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all duration-150',
              'bg-neutral-900 border',
              focusedIndex === idx
                ? 'border-blue-500 shadow-lg shadow-blue-900/40 scale-[1.03]'
                : 'border-neutral-800 hover:border-neutral-600',
              statusRingClass(photo.status)
            )}
            style={{ width: 220 }}
          >
            {/* Thumbnail */}
            <div className="relative w-full aspect-[3/2] bg-neutral-800">
              <img
                src={`${API_BASE}/api/photos/${photo.id}/thumbnail`}
                alt={photo.filename}
                className="w-full h-full object-cover"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/review/${photo.id}`)
                }}
                draggable={false}
              />

              {/* Score badge */}
              <span
                className={clsx(
                  'absolute top-2 left-2 text-[11px] font-bold px-1.5 py-0.5 rounded',
                  scoreBadgeClass(photo.overall_score)
                )}
              >
                {photo.overall_score !== null ? photo.overall_score.toFixed(0) : '—'}
              </span>

              {/* Burst-leader crown */}
              {photo.is_burst_leader && (
                <span className="absolute top-2 right-2 text-[10px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded">
                  BEST
                </span>
              )}

              {/* Indicators */}
              <div className="absolute bottom-2 left-2 flex gap-1">
                {photo.is_blurry && (
                  <span title="Blurry" className="text-xs bg-black/60 rounded px-1 py-0.5 flex items-center gap-0.5 text-neutral-200">
                    <Wind size={11} />
                  </span>
                )}
                {photo.has_closed_eyes && (
                  <span title="Closed eyes" className="text-xs bg-black/60 rounded px-1 py-0.5 flex items-center gap-0.5 text-neutral-200 line-through decoration-rose-400">
                    <Eye size={11} />
                  </span>
                )}
              </div>

              {/* Status badge */}
              {photo.status !== 'pending' && (
                <span
                  className={clsx(
                    'absolute bottom-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded',
                    photo.status === 'accepted'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-700 text-white'
                  )}
                >
                  {photo.status === 'accepted' ? '✓' : '✕'}
                </span>
              )}
            </div>

            {/* Filename */}
            <div className="px-3 py-1.5">
              <p className="text-[11px] text-neutral-400 truncate" title={photo.filename}>
                {photo.filename}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-1 px-3 pb-3">
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange(photo.id, 'accepted') }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-colors',
                  photo.status === 'accepted'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-emerald-800 hover:text-white'
                )}
                title="Accept (A)"
              >
                <Check size={11} /> Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange(photo.id, 'rejected') }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-colors',
                  photo.status === 'rejected'
                    ? 'bg-rose-800 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-rose-900 hover:text-white'
                )}
                title="Reject (R)"
              >
                <XCircle size={11} /> Reject
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange(photo.id, 'pending') }}
                className="px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                title="Reset to pending"
              >
                <RotateCcw size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="shrink-0 px-6 py-2 border-t border-neutral-800 bg-neutral-950 flex items-center gap-4 text-[11px] text-neutral-600">
        <span>← → navigate</span>
        <span>A accept focused</span>
        <span>R reject focused</span>
        <span>Esc close</span>
        <span className="ml-auto">Burst group: {burstGroupId}</span>
      </div>
    </div>
  )
}
