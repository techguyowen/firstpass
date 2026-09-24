import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Photo } from '../types/photo'
import { Camera, Sparkles, Check, X, Eye, GripHorizontal, RotateCcw, RotateCw } from 'lucide-react'
import clsx from 'clsx'

export type HudMode = 0 | 1 | 2 // 0: Off, 1: Triage Summary, 2: EXIF Camera & Exposure

export interface HudPosition {
  x: number
  y: number
}

interface InfoOverlayProps {
  photo: Photo
  currentIndex?: number
  totalPhotos?: number
  hudMode: HudMode
  onCycleHud?: () => void
  onClose?: () => void
  position?: HudPosition
  onPositionChange?: (pos: HudPosition) => void
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-neutral-400 bg-neutral-800'
  if (score >= 70) return 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50'
  if (score >= 40) return 'text-amber-300 bg-amber-950/80 border-amber-500/50'
  return 'text-rose-300 bg-rose-950/80 border-rose-500/50'
}

const DEFAULT_POS: HudPosition = { x: 20, y: 20 }

function formatExifDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const norm = dateStr.slice(0, 10).replace(/:/g, '-') + dateStr.slice(10)
    const d = new Date(norm)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    }
  } catch {}
  return dateStr.replace('T', ' ')
}

export function getStoredHudPosition(): HudPosition {
  try {
    const raw = localStorage.getItem('firstpass_hud_pos') || localStorage.getItem('photo_culler_hud_pos')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return {
          x: Math.max(10, Math.min(window.innerWidth - 260, parsed.x)),
          y: Math.max(10, Math.min(window.innerHeight - 100, parsed.y))
        }
      }
    }
  } catch {}
  return DEFAULT_POS
}

export function setStoredHudPosition(pos: HudPosition): void {
  try {
    localStorage.setItem('firstpass_hud_pos', JSON.stringify(pos))
    localStorage.setItem('photo_culler_hud_pos', JSON.stringify(pos))
  } catch {}
}

export default function InfoOverlay({
  photo,
  currentIndex,
  totalPhotos,
  hudMode,
  onCycleHud,
  onClose,
  position: propPosition,
  onPositionChange
}: InfoOverlayProps) {
  const [internalPos, setInternalPos] = useState<HudPosition>(() => propPosition || getStoredHudPosition())
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number }>({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)

  const currentPos = propPosition || internalPos

  // Keep internal position in sync if prop changes
  useEffect(() => {
    if (propPosition) {
      setInternalPos(propPosition)
    }
  }, [propPosition])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag with left click
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    setIsDragging(true)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: currentPos.x,
      posY: currentPos.y
    }
  }, [currentPos])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      const overlayWidth = overlayRef.current?.offsetWidth || 300
      const overlayHeight = overlayRef.current?.offsetHeight || 120

      const nextX = Math.max(10, Math.min(window.innerWidth - overlayWidth - 10, dragStartRef.current.posX + dx))
      const nextY = Math.max(10, Math.min(window.innerHeight - overlayHeight - 10, dragStartRef.current.posY + dy))

      const newPos = { x: nextX, y: nextY }
      setInternalPos(newPos)
      setStoredHudPosition(newPos)
      if (onPositionChange) onPositionChange(newPos)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onPositionChange])

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation()
    setInternalPos(DEFAULT_POS)
    setStoredHudPosition(DEFAULT_POS)
    if (onPositionChange) onPositionChange(DEFAULT_POS)
  }

  if (hudMode === 0) return null

  return (
    <div
      ref={overlayRef}
      style={{
        left: `${currentPos.x}px`,
        top: `${currentPos.y}px`,
      }}
      className={clsx(
        'absolute z-30 select-none max-w-md transition-shadow duration-150',
        'bg-neutral-950/85 backdrop-blur-md border border-neutral-700/70 rounded-xl p-3 shadow-2xl group',
        'hover:border-neutral-500/80',
        isDragging && 'shadow-indigo-500/20 border-indigo-500/60 cursor-grabbing ring-1 ring-indigo-500/40'
      )}
    >
      {/* Movable Grip Header */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleResetPosition}
        className="flex items-center justify-between pb-1 mb-1.5 border-b border-neutral-800/80 text-[10px] text-neutral-400 cursor-grab active:cursor-grabbing"
        title="Click and drag to move HUD anywhere · Double-click to reset top-left"
      >
        <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-neutral-300">
          <GripHorizontal size={13} className="text-neutral-500 group-hover:text-indigo-400" />
          <span className="font-mono font-semibold tracking-wider uppercase text-[9px]">HUD {hudMode === 1 ? 'Triage' : 'EXIF'}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Reset position button */}
          <button
            type="button"
            onClick={handleResetPosition}
            className="p-0.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-white transition-colors cursor-pointer"
            title="Snap HUD back to default top-left"
          >
            <RotateCcw size={10} />
          </button>
          {/* Cycle HUD Mode button */}
          {onCycleHud && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCycleHud()
              }}
              className="px-1.5 py-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer font-mono text-[9px]"
              title="Cycle HUD mode (I)"
            >
              <RotateCw size={9} />
              <span>{hudMode}/2</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="p-0.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
              title="Close HUD (Press 'I' to re-open)"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Mode 1: Triage Summary HUD */}
      {hudMode === 1 && (
        <div className="space-y-2">
          {/* Top Line: Filename & Index */}
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-white tracking-wide truncate max-w-[240px]">
              {photo.filename}
            </span>
            {currentIndex !== undefined && totalPhotos !== undefined && (
              <span className="font-mono text-[11px] text-neutral-400 shrink-0 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                {currentIndex + 1} / {totalPhotos}
              </span>
            )}
          </div>

          {/* Badges: Status, Tag, Score */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Status */}
            <span
              className={clsx(
                'px-2 py-0.5 rounded-md font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1 border',
                photo.status === 'accepted' ? 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70' :
                photo.status === 'rejected' ? 'bg-rose-900/60 text-rose-300 border-rose-600/70' :
                'bg-neutral-800 text-neutral-400 border-neutral-700'
              )}
            >
              {photo.status === 'accepted' && <Check size={11} strokeWidth={3} />}
              {photo.status === 'rejected' && <X size={11} strokeWidth={3} />}
              <span>{photo.status}</span>
            </span>

            {/* Tag */}
            {photo.is_tagged && (
              <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/60 flex items-center gap-1">
                <span>🏷️</span>
                <span>Tagged</span>
              </span>
            )}

            {/* AI Score */}
            {photo.overall_score !== null && photo.is_analyzed && (
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-md font-mono font-bold text-[11px] border flex items-center gap-1',
                  scoreColor(photo.overall_score)
                )}
              >
                <Sparkles size={11} />
                <span>{Math.round(photo.overall_score)} Score</span>
              </span>
            )}

            {/* Format */}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-900 text-neutral-400 border border-neutral-800">
              {photo.is_raw ? (photo.raw_format?.toUpperCase() || 'RAW') : 'JPG'}
            </span>
          </div>
        </div>
      )}

      {/* Mode 2: Photographic EXIF HUD */}
      {hudMode === 2 && (
        <div className="space-y-1.5 text-xs">
          {/* Camera & Lens */}
          <div className="flex items-center gap-1.5 font-bold text-white truncate">
            <Camera size={13} className="text-blue-400 shrink-0" />
            <span className="truncate">
              {[photo.camera_make, photo.camera_model].filter(Boolean).join(' ') || 'Unknown Camera'}
            </span>
          </div>

          {photo.lens_model && (
            <p className="text-[11px] text-neutral-400 font-mono truncate pl-5">
              {photo.lens_model}
            </p>
          )}

          {/* Exposure Triangle Bar */}
          <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-neutral-200">
            {photo.shutter_speed && (
              <span className="bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                ⚡ {photo.shutter_speed}
              </span>
            )}
            {photo.aperture && (
              <span className="bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                ⭕ {photo.aperture}
              </span>
            )}
            {photo.iso && (
              <span className="bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                ISO {photo.iso}
              </span>
            )}
            {photo.focal_length && (
              <span className="bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                🔭 {photo.focal_length}
              </span>
            )}
          </div>

          {/* Resolution & Date */}
          <div className="flex items-center justify-between gap-3 pt-1 text-[10px] text-neutral-400 font-mono border-t border-neutral-800/80">
            {photo.width && photo.height && (
              <span>
                {photo.width}×{photo.height} ({((photo.width * photo.height) / 1e6).toFixed(1)} MP)
              </span>
            )}
            {photo.exif_date && (
              <span>{formatExifDate(photo.exif_date)}</span>
            )}
          </div>
        </div>
      )}

      {/* Subtle Hint */}
      <div className="text-[9px] text-neutral-500 mt-1.5 pt-1 border-t border-neutral-800/60 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <span>Drag to move · Press 'I' to cycle</span>
        <span className="font-mono">HUD {hudMode}/2</span>
      </div>
    </div>
  )
}
