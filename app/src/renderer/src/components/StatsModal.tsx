import { useEffect, useState } from 'react'
import { X, BarChart2, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface StatsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface StatsResponse {
  total: number
  analyzed: number
  accepted: number
  rejected: number
  pending: number
  blurry: number
  duplicates: number
  by_reason: {
    blurry: number
    underexposed: number
    overexposed: number
    closed_eyes: number
    duplicates: number
    has_faces: number
    solo: number
    pairs: number
    groups: number
  }
  date_range: { earliest: string | null; latest: string | null }
  top_camera: string | null
}

const API_BASE = 'http://localhost:58765'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    let normalized = dateStr.trim()
    if (/^\d{4}:\d{2}:\d{2}/.test(normalized)) {
      normalized = normalized.slice(0, 10).replace(/:/g, '-') + normalized.slice(10)
    }
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number
  colorClass?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center bg-neutral-800 rounded-xl px-5 py-4 gap-1 flex-1">
      <span className={clsx('text-2xl font-bold tabular-nums', colorClass ?? 'text-white')}>
        {value.toLocaleString()}
      </span>
      <span className="text-[12px] text-neutral-400">{label}</span>
    </div>
  )
}

function QualityPill({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 bg-neutral-800 rounded-lg px-3 py-2">
      <span className="text-sm font-semibold text-white tabular-nums">{count.toLocaleString()}</span>
      <span className="text-[12px] text-neutral-400">{label}</span>
    </div>
  )
}

export default function StatsModal({ isOpen, onClose }: StatsModalProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/api/stats`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<StatsResponse>
      })
      .then((data) => {
        setStats(data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load stats')
      })
      .finally(() => setLoading(false))
  }, [isOpen])

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Library stats"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-2xl bg-neutral-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 text-white font-semibold text-lg">
            <BarChart2 size={20} className="text-blue-400" />
            Library Stats
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={28} className="animate-spin text-blue-400" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-40 text-rose-400 text-sm">
              ⚠ {error}
            </div>
          )}

          {stats && !loading && (
            <>
              {/* Summary cards */}
              <section>
                <div className="flex gap-3">
                  <StatCard label="Total Photos" value={stats.total} />
                  <StatCard label="✓ Accepted" value={stats.accepted} colorClass="text-emerald-400" />
                  <StatCard label="✕ Rejected" value={stats.rejected} colorClass="text-rose-400" />
                  <StatCard label="⏳ Pending" value={stats.pending} colorClass="text-neutral-300" />
                </div>
              </section>

              {/* Progress bar */}
              {stats.total > 0 && (
                <section>
                  <div className="flex rounded-full overflow-hidden h-3 bg-neutral-800 w-full">
                    {stats.accepted > 0 && (
                      <div
                        className="bg-emerald-500 h-full transition-all"
                        style={{ width: `${(stats.accepted / stats.total) * 100}%` }}
                        title={`Accepted: ${((stats.accepted / stats.total) * 100).toFixed(1)}%`}
                      />
                    )}
                    {stats.rejected > 0 && (
                      <div
                        className="bg-rose-600 h-full transition-all"
                        style={{ width: `${(stats.rejected / stats.total) * 100}%` }}
                        title={`Rejected: ${((stats.rejected / stats.total) * 100).toFixed(1)}%`}
                      />
                    )}
                    {stats.pending > 0 && (
                      <div
                        className="bg-neutral-600 h-full flex-1"
                        title={`Pending: ${((stats.pending / stats.total) * 100).toFixed(1)}%`}
                      />
                    )}
                  </div>
                  <div className="flex text-[11px] text-neutral-500 mt-1 gap-4">
                    <span className="text-emerald-500">
                      ● {((stats.accepted / stats.total) * 100).toFixed(1)}% accepted
                    </span>
                    <span className="text-rose-500">
                      ● {((stats.rejected / stats.total) * 100).toFixed(1)}% rejected
                    </span>
                    <span className="text-neutral-500">
                      ● {((stats.pending / stats.total) * 100).toFixed(1)}% pending
                    </span>
                  </div>
                </section>
              )}

              {/* Quality issues */}
              <section>
                <h3 className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                  Quality Issues
                </h3>
                <div className="flex flex-wrap gap-2">
                  <QualityPill label="🌫 Blurry" count={stats.by_reason.blurry} />
                  <QualityPill label="🔅 Too Dark" count={stats.by_reason.underexposed} />
                  <QualityPill label="☀ Too Bright" count={stats.by_reason.overexposed} />
                  <QualityPill label="👁 Closed Eyes" count={stats.by_reason.closed_eyes} />
                  <QualityPill label="🔁 Duplicates" count={stats.by_reason.duplicates} />
                </div>
              </section>

              {/* People section */}
              <section>
                <h3 className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                  People
                </h3>
                <div className="flex flex-wrap gap-2">
                  <QualityPill label="👤 Has Faces" count={stats.by_reason.has_faces} />
                  <QualityPill label="Solo Portraits" count={stats.by_reason.solo} />
                  <QualityPill label="Pairs" count={stats.by_reason.pairs} />
                  <QualityPill label="Groups (3+)" count={stats.by_reason.groups} />
                </div>
              </section>

              {/* Shoot info */}
              <section className="bg-neutral-800 rounded-xl px-5 py-4 space-y-2.5">
                <h3 className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                  Shoot Info
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-neutral-400">📅 Date range</span>
                  <span className="text-[13px] text-neutral-200">
                    {formatDate(stats.date_range.earliest)} – {formatDate(stats.date_range.latest)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-neutral-400">📷 Top camera</span>
                  <span className="text-[13px] text-neutral-200">{stats.top_camera ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-neutral-400">🔍 Analyzed</span>
                  <span className="text-[13px] text-neutral-200">
                    {stats.analyzed.toLocaleString()} / {stats.total.toLocaleString()}
                    {stats.total > 0 && (
                      <span className="text-neutral-500 ml-1">
                        ({((stats.analyzed / stats.total) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
