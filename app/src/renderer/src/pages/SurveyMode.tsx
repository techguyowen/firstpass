import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  X, ChevronLeft, ChevronRight, Trash2, CheckCircle2,
  SkipForward, Eye, Loader2,
} from 'lucide-react'
import { api } from '../api/client'
import type { Photo } from '../types/photo'

type Scope = 'rejected' | 'pending'

function rejectionTags(photo: Photo): string[] {
  const tags: string[] = []
  if (photo.is_blurry) tags.push('Blurry')
  if (photo.exposure_type === 'underexposed') tags.push('Underexposed')
  if (photo.exposure_type === 'overexposed') tags.push('Overexposed')
  if (photo.duplicate_group_id) tags.push('Duplicate')
  if (photo.has_closed_eyes) tags.push('Eyes closed')
  if (photo.overall_score !== null && photo.overall_score < 40) tags.push('Low score')
  return tags
}

export default function SurveyMode() {
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('rejected')
  const [queue, setQueue] = useState<Photo[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [rescued, setRescued] = useState(0)
  const [kept, setKept] = useState(0)
  const [saving, setSaving] = useState(false)

  const loadQueue = useCallback(async (s: Scope) => {
    setLoading(true)
    try {
      const res = await api.getPhotos({ status: s, per_page: 9999, sort_by: 'overall_score_desc' })
      setQueue(res.photos)
      setIdx(0)
      setRescued(0)
      setKept(0)
    } catch {
      toast.error('Failed to load photos for survey')
      setQueue([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQueue(scope)
  }, [scope, loadQueue])

  const exit = useCallback(() => navigate('/'), [navigate])

  const advance = useCallback(() => {
    setIdx(prev => Math.min(prev + 1, queue.length))
  }, [queue.length])

  const applyStatus = useCallback(async (status: 'rejected' | 'accepted', countAs: 'kept' | 'rescued') => {
    const photo = queue[idx]
    if (!photo || saving) return
    setSaving(true)
    try {
      await api.updatePhotoStatus(photo.id, status)
      if (countAs === 'kept') setKept(k => k + 1)
      else setRescued(r => r + 1)
      setQueue(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], status }
        return next
      })
      advance()
    } catch {
      toast.error('Failed to update photo status')
    } finally {
      setSaving(false)
    }
  }, [queue, idx, saving, advance])

  const keepRejected = useCallback(() => applyStatus('rejected', 'kept'), [applyStatus])
  const rescue = useCallback(() => applyStatus('accepted', 'rescued'), [applyStatus])
  const skip = useCallback(() => advance(), [advance])
  const goBack = useCallback(() => setIdx(prev => Math.max(0, prev - 1)), [])

  // Keyboard shortcuts: R/→ keep, A rescue, Space skip, ← back, Esc exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (loading || queue.length === 0 || idx >= queue.length) {
        if (e.key === 'Escape') exit()
        return
      }
      switch (e.key) {
        case 'r':
        case 'R':
        case 'ArrowRight':
          e.preventDefault()
          keepRejected()
          break
        case 'a':
        case 'A':
          e.preventDefault()
          rescue()
          break
        case ' ':
          e.preventDefault()
          skip()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goBack()
          break
        case 'Escape':
          e.preventDefault()
          exit()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loading, queue.length, idx, keepRejected, rescue, skip, goBack, exit])

  const done = !loading && idx >= queue.length
  const photo = !done ? queue[idx] : null

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <Eye size={16} className="text-indigo-400 shrink-0" />
        <h1 className="text-white font-semibold text-sm whitespace-nowrap">
          Survey Mode
          {!loading && queue.length > 0 && !done && (
            <span className="text-neutral-400 font-normal ml-2">
              Photo {idx + 1} of {queue.length} {scope}
            </span>
          )}
        </h1>
        {/* Scope toggle */}
        <div className="flex items-center bg-neutral-800 rounded-lg border border-neutral-700 p-0.5">
          {(['rejected', 'pending'] as Scope[]).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer',
                scope === s ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={exit}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
        >
          <X size={13} /> Exit <span className="text-neutral-500 font-mono">Esc</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-neutral-800 flex-shrink-0">
        <div
          className="h-full bg-indigo-500 transition-all duration-200"
          style={{ width: queue.length > 0 ? `${Math.min(100, (idx / queue.length) * 100)}%` : '0%' }}
        />
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
        </div>
      ) : queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <CheckCircle2 size={40} className="text-emerald-400 mb-4" />
          <h2 className="text-white font-semibold text-lg mb-1">No {scope} photos</h2>
          <p className="text-neutral-400 text-sm mb-6">There's nothing in the {scope} pile to review right now.</p>
          <button
            onClick={exit}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Back to Gallery
          </button>
        </div>
      ) : done ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <CheckCircle2 size={40} className="text-emerald-400 mb-4" />
          <h2 className="text-white font-semibold text-lg mb-1">
            You reviewed all {queue.length} {scope} photos
          </h2>
          <p className="text-neutral-400 text-sm mb-6">
            Rescued: <span className="text-emerald-400 font-semibold">{rescued}</span>
            {' · '}Kept {scope}: <span className="text-rose-400 font-semibold">{kept}</span>
          </p>
          <button
            onClick={exit}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Back to Gallery
          </button>
        </div>
      ) : photo ? (
        <>
          {/* Large centered photo */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black p-4">
            <img
              key={photo.id}
              src={api.getFullImageUrl(photo.id)}
              alt={photo.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Photo meta */}
          <div className="flex items-center justify-center gap-3 px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex-shrink-0 flex-wrap">
            <span className="text-neutral-200 text-xs font-medium truncate max-w-xs" title={photo.filename}>
              {photo.filename}
            </span>
            {photo.overall_score !== null && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
                Score {Math.round(photo.overall_score)}
              </span>
            )}
            {rejectionTags(photo).map(tag => (
              <span
                key={tag}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-800/60"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 bg-neutral-900 border-t border-neutral-800 flex-shrink-0 flex-wrap">
            <button
              onClick={goBack}
              disabled={idx === 0}
              className="flex items-center gap-1 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={keepRejected}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 size={14} /> Keep Rejected
              <kbd className="ml-1 px-1 py-0.5 bg-black/30 rounded text-[10px] font-mono">R</kbd>
            </button>
            <button
              onClick={rescue}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle2 size={14} /> Rescue → Accept
              <kbd className="ml-1 px-1 py-0.5 bg-black/30 rounded text-[10px] font-mono">A</kbd>
            </button>
            <button
              onClick={skip}
              className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            >
              <SkipForward size={14} /> Skip
              <kbd className="ml-1 px-1 py-0.5 bg-black/30 rounded text-[10px] font-mono">Space</kbd>
            </button>
            <button
              onClick={advance}
              className="flex items-center gap-1 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 text-xs rounded-lg border border-neutral-700 transition-colors cursor-pointer"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
