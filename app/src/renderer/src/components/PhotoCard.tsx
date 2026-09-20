import React, { useState } from 'react'
import { AlertCircle, CheckCircle2, XCircle, Users, Crown, Camera } from 'lucide-react'
import type { Photo } from '../types/photo'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
import clsx from 'clsx'

interface Props {
  photo: Photo
  isSelected: boolean
  isFocused?: boolean
  burstCount?: number
  isBurstExpanded?: boolean
  onToggleBurst?: () => void
  onOpenBurstModal?: () => void
  onSelect: () => void
  onClick: (e: React.MouseEvent) => void
}

function ScoreBadge({ score, isAnalyzed }: { score: number | null; isAnalyzed?: boolean }) {
  if (score === null || !isAnalyzed) {
    return (
      <span className="text-neutral-400 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700/60 shadow-sm" title="Analysis pending">
        —
      </span>
    )
  }
  const color = score >= 70 ? 'bg-emerald-600' : score >= 40 ? 'bg-amber-600' : 'bg-rose-700'
  return (
    <span className={clsx('text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm', color)}>
      {Math.round(score)}
    </span>
  )
}

export default function PhotoCard({
  photo,
  isSelected,
  isFocused,
  burstCount,
  isBurstExpanded,
  onToggleBurst,
  onOpenBurstModal,
  onSelect,
  onClick,
}: Props) {
  const [imgError, setImgError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const { fitMode, viewOptions } = usePhotosStore()

  const shootingParams = [photo.shutter_speed, photo.aperture, photo.iso ? `ISO ${photo.iso}` : null]
    .filter(Boolean)
    .join(' · ')

  let reasonSummary: string | null = null
  if (photo.reasons_json) {
    try {
      const parsed = JSON.parse(photo.reasons_json)
      reasonSummary = parsed.summary || null
    } catch {
      // ignore
    }
  }

  const isStageLighting = Boolean(
    photo.lighting_type &&
    photo.lighting_type !== 'standard' &&
    photo.lighting_type !== 'normal'
  )

  const isVip = Boolean(
    photo.face_count &&
    photo.face_count > 0 &&
    photo.is_vip_focused
  )

  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative group rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-150 flex flex-col',
        'bg-neutral-900 hover:border-indigo-500 hover:shadow-indigo-500/10',
        isSelected ? 'border-indigo-500 ring-2 ring-indigo-400/40' : 'border-neutral-800',
        isFocused && 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-neutral-950 scale-[1.01] z-20 border-indigo-400',
        photo.status === 'accepted' && 'border-emerald-600/80',
        photo.status === 'rejected' && 'opacity-60 border-rose-700/80',
        burstCount && burstCount > 1 && !isBurstExpanded && 'shadow-[3px_3px_0px_0px_rgba(255,255,255,0.08),6px_6px_0px_0px_rgba(255,255,255,0.04)]',
      )}
      style={{ height: 230 }}
    >
      {/* Thumbnail area */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-neutral-950 flex items-center justify-center">
        {!imgError ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 bg-neutral-800 animate-pulse" />
            )}
            <img
              src={api.getThumbnailUrl(photo.id)}
              alt={photo.filename}
              decoding="async"
              className={clsx(
                'w-full h-full transition-opacity duration-100',
                fitMode === 'contain' ? 'object-contain' : 'object-cover',
                loaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setLoaded(true)}
              onError={() => { setImgError(true); setLoaded(true) }}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600">
            <AlertCircle size={32} />
          </div>
        )}

        {/* Checkbox (top-left, visible on hover or selected) */}
        <div
          onClick={e => { e.stopPropagation(); onSelect() }}
          className={clsx(
            'absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10',
            'bg-black/60 cursor-pointer backdrop-blur-sm',
            isSelected
              ? 'border-indigo-400 bg-indigo-600 shadow-md'
              : 'border-white/40 opacity-0 group-hover:opacity-100'
          )}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Burst Stack / Hero Badge */}
        {burstCount && burstCount > 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (onOpenBurstModal) {
                onOpenBurstModal()
              } else {
                onToggleBurst?.()
              }
            }}
            title={isBurstExpanded ? "Collapse burst sequence" : `Expand all ${burstCount} shots in this burst`}
            className={clsx(
              'absolute top-2 left-9 z-10 flex items-center gap-1 font-bold text-[9px] px-2 py-0.5 rounded-full shadow-lg transition-all cursor-pointer',
              photo.is_burst_leader
                ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 shadow-amber-500/30'
                : 'bg-neutral-800/90 text-neutral-200 border border-neutral-700/80 hover:bg-neutral-700'
            )}
          >
            {photo.is_burst_leader ? (
              <>
                <Crown size={10} className="stroke-[2.5]" />
                <span>HERO · {burstCount} SHOTS</span>
              </>
            ) : (
              <>
                <span>⚡ {burstCount} SHOTS</span>
              </>
            )}
            <span className="text-[7px] ml-0.5 opacity-75">{isBurstExpanded ? '▲' : '▼'}</span>
          </button>
        ) : photo.is_burst_leader ? (
          <div className="absolute top-2 left-9 z-10 flex items-center gap-1 bg-amber-500 text-gray-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-lg shadow-amber-500/30">
            <Crown size={10} className="stroke-[2.5]" />
            <span>HERO SHOT</span>
          </div>
        ) : null}

        {/* Status & Tag badges (top-right) */}
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          {photo.is_tagged && (
            <div className="px-1.5 py-0.5 bg-amber-500/90 text-neutral-950 font-black text-[10px] rounded shadow flex items-center gap-0.5 backdrop-blur-sm" title="Tagged (\)">
              <span>🏷️</span>
            </div>
          )}
          {photo.status === 'accepted' && (
            <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center shadow">
              <CheckCircle2 size={12} className="text-white" />
            </div>
          )}
          {photo.status === 'rejected' && (
            <div className="w-5 h-5 bg-rose-700 rounded-full flex items-center justify-center shadow">
              <XCircle size={12} className="text-white" />
            </div>
          )}
        </div>

        {/* Face count badge */}
        {photo.face_count != null && photo.face_count > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-sm rounded-md px-1.5 py-0.5 z-10 border border-gray-800">
            <Users size={10} className="text-indigo-400" />
            <span className="text-white text-[9px] font-mono">{photo.face_count}</span>
          </div>
        )}

        {/* Hover overlay with filename, EXIF & Explainable AI Summary */}
        <div className="absolute top-0 inset-x-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/90 via-black/75 to-transparent p-2.5 pointer-events-none z-10">
          <p className="text-white text-[11px] font-medium truncate">{photo.filename}</p>
          {shootingParams && (
            <p className="text-indigo-300 font-mono text-[10px] flex items-center gap-1 mt-0.5">
              <Camera size={9} />
              <span>{shootingParams}</span>
            </p>
          )}
          {reasonSummary && (
            <p className="text-emerald-300 text-[10px] mt-1 line-clamp-2 leading-tight">
              💡 {reasonSummary}
            </p>
          )}
        </div>
      </div>

      {/* Card Footer: Metadata, Badges & Score */}
      {(viewOptions.showAiChips || viewOptions.showExif || viewOptions.showFilename || viewOptions.showScoreBadge) && (
        <div className="p-2 bg-neutral-900 border-t border-neutral-800/80 z-10 flex flex-col gap-1">
          {/* AI Quality & Category Labels */}
          {viewOptions.showAiChips && (
            <div className="flex gap-1 flex-wrap items-center min-h-[16px]">
              {photo.is_tagged && (
                <span title="Tagged (\)" className="text-[9px] font-bold bg-amber-500/90 text-neutral-950 px-1 py-0.2 rounded font-black">
                  🏷️ TAGGED
                </span>
              )}
              {!photo.is_analyzed && (
                <span title="Analysis pending" className="text-[9px] font-semibold bg-neutral-800 text-neutral-400 px-1 py-0.2 rounded border border-neutral-700/60">
                  PENDING AI
                </span>
              )}
              {photo.is_detail_shot && (
                <span title="Flat-Lay / Detail Shot (Symmetry & Texture Prioritized)" className="text-[9px] font-bold bg-amber-700/90 text-white px-1 py-0.2 rounded">
                  💍 DETAIL
                </span>
              )}
              {photo.is_motion_intentional && (
                <span title="Action Motion (Intentional Panning Blur Preserved)" className="text-[9px] font-bold bg-purple-700/90 text-white px-1 py-0.2 rounded">
                  🏎️ ACTION
                </span>
              )}
              {isStageLighting && (
                <span title={`Stage / Atmosphere Lighting (${photo.lighting_type})`} className="text-[9px] font-bold bg-fuchsia-700/90 text-white px-1 py-0.2 rounded">
                  🎭 STAGE
                </span>
              )}
              {isVip && (
                <span title="VIP Primary Subject in Sharp Focus" className="text-[9px] font-bold bg-yellow-500/90 text-black px-1 py-0.2 rounded font-black">
                  👑 VIP
                </span>
              )}
              {photo.is_blurry && !photo.is_bokeh && !photo.is_motion_intentional && (
                <span title="Blurry image" className="text-[9px] font-bold bg-rose-800/90 text-white px-1 py-0.2 rounded">
                  BLUR
                </span>
              )}
              {photo.is_bokeh && (
                <span title="Intentional Bokeh (Sharp Focus)" className="text-[9px] font-bold bg-sky-700/90 text-white px-1 py-0.2 rounded">
                  BOKEH
                </span>
              )}
              {photo.smile_score !== undefined && photo.smile_score !== null && photo.smile_score > 30 && (
                <span title="Flattering Smile" className="text-[9px] font-bold bg-amber-600/90 text-white px-1 py-0.2 rounded">
                  SMILE
                </span>
              )}
              {photo.exposure_type === 'underexposed' && (
                <span title="Underexposed" className="text-[9px] font-bold bg-blue-800/90 text-white px-1 py-0.2 rounded">
                  DARK
                </span>
              )}
              {photo.exposure_type === 'overexposed' && (
                <span title="Overexposed" className="text-[9px] font-bold bg-amber-700/90 text-white px-1 py-0.2 rounded">
                  BRIGHT
                </span>
              )}
              {photo.has_closed_eyes && (
                <span title="Closed eyes detected" className="text-[9px] font-bold bg-purple-800/90 text-white px-1 py-0.2 rounded">
                  EYES
                </span>
              )}
              {photo.is_raw && (
                <span className="text-[9px] font-bold bg-cyan-800/90 text-white px-1 py-0.2 rounded">
                  RAW
                </span>
              )}
              {photo.duplicate_group_id && (
                <span title="Part of duplicate group" className="text-[9px] font-bold bg-neutral-700/90 text-white px-1 py-0.2 rounded">
                  DUP
                </span>
              )}
            </div>
          )}

          {/* EXIF Camera Info */}
          {viewOptions.showExif && shootingParams && (
            <div className="flex items-center gap-1 text-[10px] text-indigo-300 font-mono truncate">
              <Camera size={10} className="shrink-0 text-indigo-400" />
              <span className="truncate">{shootingParams}</span>
            </div>
          )}

          {/* Filename & Score Row */}
          {(viewOptions.showFilename || viewOptions.showScoreBadge) && (
            <div className="flex items-center justify-between gap-1">
              {viewOptions.showFilename ? (
                <span className="text-[11px] text-neutral-300 font-medium truncate flex-1" title={photo.filename}>
                  {photo.filename}
                </span>
              ) : (
                <div className="flex-1" />
              )}
              {viewOptions.showScoreBadge && (
                <ScoreBadge score={photo.overall_score} isAnalyzed={photo.is_analyzed} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
