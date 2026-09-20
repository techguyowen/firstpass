import { useMemo } from 'react'
import type { Photo } from '../types/photo'

interface ShootSummaryBarProps {
  photos: Photo[]
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    let normalized = dateStr.trim()
    if (/^\d{4}:\d{2}:\d{2}/.test(normalized)) {
      normalized = normalized.slice(0, 10).replace(/:/g, '-') + normalized.slice(10)
    }
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 text-[11px] text-neutral-300 whitespace-nowrap ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

export default function ShootSummaryBar({ photos }: ShootSummaryBarProps) {
  const stats = useMemo(() => {
    if (photos.length === 0) return null

    const total = photos.length
    const accepted = photos.filter((p) => p.status === 'accepted').length
    const rejected = photos.filter((p) => p.status === 'rejected').length
    const pending = photos.filter((p) => p.status === 'pending').length
    const analyzed = photos.filter((p) => p.is_analyzed).length

    const scoreValues = photos
      .map((p) => p.overall_score)
      .filter((s): s is number => s !== null)
    const avgScore =
      scoreValues.length > 0
        ? parseFloat((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1))
        : null

    const withFaces = photos.filter((p) => p.face_count !== null && p.face_count > 0).length
    const blurry = photos.filter((p) => p.is_blurry === true).length

    // Date range from exif_date
    const dates = photos
      .map((p) => p.exif_date)
      .filter((d): d is string => d !== null)
      .sort()
    const earliest = dates[0] ?? null
    const latest = dates[dates.length - 1] ?? null

    // Top camera
    const cameraCount: Record<string, number> = {}
    for (const p of photos) {
      if (p.camera_model) {
        cameraCount[p.camera_model] = (cameraCount[p.camera_model] ?? 0) + 1
      }
    }
    const topCamera =
      Object.keys(cameraCount).length > 0
        ? Object.entries(cameraCount).sort((a, b) => b[1] - a[1])[0][0]
        : null

    return { total, accepted, rejected, pending, analyzed, avgScore, withFaces, blurry, earliest, latest, topCamera }
  }, [photos])

  if (!stats) return null

  const sameDay = stats.earliest === stats.latest || stats.latest === null

  return (
    <div className="w-full bg-neutral-900/50 border-b border-neutral-800 px-4 py-1.5 flex items-center gap-1.5 flex-wrap overflow-hidden">
      {/* Total */}
      <Chip>📷 {stats.total.toLocaleString()} photos</Chip>

      {/* Divider */}
      <span className="text-neutral-700 select-none">·</span>

      {/* Accepted */}
      <Chip className="text-emerald-400">
        ✓ {stats.accepted.toLocaleString()} accepted
      </Chip>

      {/* Rejected */}
      <Chip className="text-rose-400">
        ✕ {stats.rejected.toLocaleString()} rejected
      </Chip>

      {/* Pending */}
      {stats.pending > 0 && (
        <Chip>⏳ {stats.pending.toLocaleString()} pending</Chip>
      )}

      <span className="text-neutral-700 select-none">·</span>

      {/* Avg score */}
      {stats.avgScore !== null && (
        <Chip>★ {stats.avgScore} avg</Chip>
      )}

      {/* Faces */}
      {stats.withFaces > 0 && (
        <Chip>👤 {stats.withFaces.toLocaleString()} faces</Chip>
      )}

      {/* Blurry */}
      {stats.blurry > 0 && (
        <Chip className="text-yellow-500">🌫 {stats.blurry.toLocaleString()} blurry</Chip>
      )}

      {/* Date range */}
      {stats.earliest && (
        <>
          <span className="text-neutral-700 select-none">·</span>
          <Chip>
            📅{' '}
            {sameDay
              ? formatShortDate(stats.earliest)
              : `${formatShortDate(stats.earliest)} – ${formatShortDate(stats.latest)}`}
          </Chip>
        </>
      )}

      {/* Top camera */}
      {stats.topCamera && (
        <Chip>📷 {stats.topCamera}</Chip>
      )}

      {/* Analyzed indicator (subtle, rightmost) */}
      {stats.analyzed < stats.total && (
        <>
          <span className="text-neutral-700 select-none ml-auto">·</span>
          <Chip className="text-neutral-500">
            🔍 {stats.analyzed}/{stats.total} analyzed
          </Chip>
        </>
      )}
    </div>
  )
}
