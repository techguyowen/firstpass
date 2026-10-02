import React, { useState, useEffect } from 'react'
import { FolderUp, Copy, Trash2, CheckCircle2, X, Folder, Sparkles, AlertTriangle, Target } from 'lucide-react'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
import toast from 'react-hot-toast'
import type { JobStatus, Photo } from '../types/photo'

interface ExportModalProps {
  onClose: () => void
  selectedIds?: number[]
  initialScope?: 'accepted' | 'tagged' | 'tagged_selected' | 'rejected' | 'selected'
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose, selectedIds = [], initialScope }) => {
  const { photos, loadPhotos } = usePhotosStore()

  const acceptedPhotos = photos.filter((p) => p.status === 'accepted')
  const rejectedPhotos = photos.filter((p) => p.status === 'rejected')
  const taggedPhotos = photos.filter((p) => Boolean(p.is_tagged))
  const selectedPhotos = photos.filter((p) => selectedIds.includes(p.id))
  const taggedSelectedPhotos = selectedPhotos.filter((p) => Boolean(p.is_tagged))

  const [scope, setScope] = useState<'accepted' | 'tagged' | 'tagged_selected' | 'rejected' | 'selected'>(() => {
    if (initialScope) return initialScope
    if (selectedIds.length > 0) {
      return taggedSelectedPhotos.length > 0 ? 'tagged_selected' : 'selected'
    }
    if (taggedPhotos.length > 0 && acceptedPhotos.length === 0) return 'tagged'
    return 'accepted'
  })

  const [action, setAction] = useState<'copy' | 'move' | 'trash' | 'xmp'>('copy')
  const [destFolder, setDestFolder] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('firstpass_last_export_folder')
      if (saved) return saved
    } catch {}
    const sample = photos.find((p) => p.folder)
    if (sample?.folder) {
      return `${sample.folder}/Exported_Keepers`
    }
    return ''
  })
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<JobStatus | null>(null)
  const [isAutoPickingDuplicates, setIsAutoPickingDuplicates] = useState(false)
  const [deliveryQuota, setDeliveryQuota] = useState<number | null>(null)

  // Load the delivery target quota for the pre-flight quota progress row.
  useEffect(() => {
    let cancelled = false
    api.getSettings()
      .then(s => {
        if (!cancelled) setDeliveryQuota(s.target_delivery_count ?? null)
      })
      .catch(() => {
        if (!cancelled) setDeliveryQuota(null)
      })
    return () => { cancelled = true }
  }, [])

  const handleAutoPickDuplicates = async () => {
    setIsAutoPickingDuplicates(true)
    try {
      const res = await api.autoPickDuplicates()
      toast.success(`Done! ${res.accepted} kept, ${res.rejected} rejected across ${res.groups_processed} groups`)
      // Reload photos in background
      const store = usePhotosStore.getState()
      store.loadPhotos()
    } catch (e: any) {
      toast.error('Auto-pick failed')
    } finally {
      setIsAutoPickingDuplicates(false)
    }
  }

  let targetPhotos: Photo[] = []
  if (scope === 'accepted') targetPhotos = acceptedPhotos
  else if (scope === 'tagged') targetPhotos = taggedPhotos
  else if (scope === 'tagged_selected') targetPhotos = taggedSelectedPhotos
  else if (scope === 'rejected') targetPhotos = rejectedPhotos
  else targetPhotos = selectedPhotos

  // Pre-flight delivery safety inspection of the current export batch.
  const blinkCount = targetPhotos.filter(p => p.has_closed_eyes).length
  const blurryCount = targetPhotos.filter(p => p.is_blurry).length
  const flaggedPhotos = targetPhotos.filter(p => p.has_closed_eyes || p.is_blurry)
  const hasFlags = blinkCount > 0 || blurryCount > 0
  const quotaTarget = deliveryQuota && deliveryQuota > 0 ? deliveryQuota : null
  const quotaPct = quotaTarget ? Math.min(100, Math.round((acceptedPhotos.length / quotaTarget) * 100)) : null

  const handleSelectFolder = async () => {
    try {
      const folder = await window.electronAPI?.openFolderDialog()
      if (folder) setDestFolder(folder)
    } catch (err) {
      console.error('Folder selection error:', err)
    }
  }

  const handleExport = async () => {
    if (targetPhotos.length === 0) {
      toast.error('No photos match the selected criteria')
      return
    }

    if (action !== 'trash' && action !== 'xmp' && !destFolder) {
      toast.error('Please choose a destination folder')
      return
    }

    setExporting(true)
    setExportProgress({ job_id: '', status: 'pending', progress: 0, total: targetPhotos.length, message: 'Starting export...' })
    try {
      const res = await api.exportPhotos(
        {
          photo_ids: targetPhotos.map((p) => p.id),
          action,
          destination_folder: destFolder || undefined,
        },
        (job) => setExportProgress(job)
      )

      if (res.success) {
        if (destFolder) {
          try { localStorage.setItem('firstpass_last_export_folder', destFolder) } catch {}
        }
        toast.success(res.message || `Successfully processed ${res.count} photo(s)!`)
        await loadPhotos()
        onClose()
      } else {
        toast.error(res.message || 'Export failed')
      }
    } catch (err: any) {
      toast.error('Export error: ' + (err.message || 'Unknown error'))
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exporting, onClose])

  const progressPct = exportProgress && exportProgress.total > 0
    ? Math.min(100, Math.round((exportProgress.progress / exportProgress.total) * 100))
    : 0

  return (
    <div 
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !exporting && onClose()}
    >
      <div 
        className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <FolderUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Export Culled Photos</h2>
            <p className="text-xs text-gray-400">Save keepers or clean up rejected files</p>
          </div>
        </div>

        {/* Automated Pre-Flight Sanity Card */}
        {hasFlags ? (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-200">
                  ⚠️ Pre-Flight Check: {blinkCount} blink{blinkCount === 1 ? '' : 's'}, {blurryCount} blurry photo{blurryCount === 1 ? '' : 's'} in selected export batch
                </p>
                <p className="text-[11px] text-amber-200/70 mt-0.5">
                  Review these before delivery — flagged keepers often need a swap.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5">
              {flaggedPhotos.slice(0, 8).map(p => (
                <img
                  key={p.id}
                  src={api.getThumbnailUrl(p.id)}
                  alt={p.filename}
                  title={`${p.filename}${p.has_closed_eyes ? ' · blink' : ''}${p.is_blurry ? ' · blurry' : ''}`}
                  className="w-11 h-11 rounded-lg object-cover border border-amber-500/50 flex-shrink-0"
                  loading="lazy"
                  draggable={false}
                />
              ))}
              {flaggedPhotos.length > 8 && (
                <span className="text-[11px] font-semibold text-amber-300 flex-shrink-0 pl-1">
                  +{flaggedPhotos.length - 8} more
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-xs font-semibold text-emerald-200">
                ✓ Pre-Flight Check: 0 blinks or severe blur detected in this export batch
              </p>
            </div>
          </div>
        )}

        {/* Delivery target quota progress */}
        {quotaTarget !== null && quotaPct !== null && (
          <div className="mb-4 rounded-xl border border-gray-800 bg-gray-950 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                Delivery target
              </span>
              <span className="text-xs font-mono text-gray-400">
                {acceptedPhotos.length} / {quotaTarget} keepers ({quotaPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${quotaPct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Duplicates Auto Pick */}
          <div className="border border-neutral-700/60 rounded-xl p-4 bg-neutral-950/50">
            <h3 className="text-xs font-bold text-neutral-200 mb-1">Duplicate Handling</h3>
            <p className="text-neutral-400 text-xs mb-3">For each duplicate group, automatically keep the sharpest photo and reject the rest.</p>
            <button
              onClick={handleAutoPickDuplicates}
              disabled={isAutoPickingDuplicates || exporting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>{isAutoPickingDuplicates ? '⏳ Processing…' : '🏆 Auto-Pick Best Duplicates'}</span>
            </button>
          </div>

          {/* Which photos */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
              Photos to Export
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setScope('accepted')}
                disabled={exporting}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 ${
                  scope === 'accepted'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span>Keepers</span>
                <span className="text-[11px] opacity-80">({acceptedPhotos.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setScope('tagged')}
                disabled={exporting}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 ${
                  scope === 'tagged'
                    ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/40'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span className="flex items-center gap-1"><span>🏷️</span> Tagged</span>
                <span className="text-[11px] opacity-80">({taggedPhotos.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setScope(taggedSelectedPhotos.length > 0 ? 'tagged_selected' : 'selected')}
                disabled={selectedIds.length === 0 || exporting}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 relative ${
                  scope === 'selected' || scope === 'tagged_selected'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span>Selected</span>
                <span className="text-[11px] opacity-80">({selectedIds.length})</span>
                {taggedSelectedPhotos.length > 0 && (
                  <span className="absolute -top-1.5 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-neutral-950 shadow">
                    {taggedSelectedPhotos.length} 🏷️
                  </span>
                )}
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  setScope('rejected')
                  if (action === 'copy') setAction('trash')
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                  scope === 'rejected'
                    ? 'bg-rose-600/20 border-rose-500 text-rose-300 shadow-md'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span>Rejected</span>
                <span className="text-[11px] opacity-80">({rejectedPhotos.length})</span>
              </button>
            </div>

            {/* When selection has tagged items, show a quick toggle for Tagged Selected vs All Selected */}
            {(scope === 'selected' || scope === 'tagged_selected') && taggedSelectedPhotos.length > 0 && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800/60 text-xs">
                <span className="text-[11px] text-neutral-400">Within selection:</span>
                <button
                  type="button"
                  onClick={() => setScope('selected')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    scope === 'selected'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  All Selected ({selectedPhotos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('tagged_selected')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    scope === 'tagged_selected'
                      ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                      : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                  }`}
                >
                  <span>🏷️</span> Tagged Only ({taggedSelectedPhotos.length})
                </button>
              </div>
            )}

            {/* Queue breakdown badge bar */}
            <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Queue:</span>
                <span className="text-white font-bold">{targetPhotos.length} photo{targetPhotos.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {targetPhotos.filter(p => p.status === 'accepted').length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    ✓ {targetPhotos.filter(p => p.status === 'accepted').length}
                  </span>
                )}
                {targetPhotos.filter(p => Boolean(p.is_tagged)).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                    <span>🏷️</span> {targetPhotos.filter(p => Boolean(p.is_tagged)).length} Tagged
                  </span>
                )}
                {targetPhotos.filter(p => p.status === 'rejected').length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    ✕ {targetPhotos.filter(p => p.status === 'rejected').length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
              Export Action
            </label>
            <div className={exporting ? 'space-y-2 opacity-50 pointer-events-none' : 'space-y-2'}>
              <label
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  action === 'copy'
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="copy"
                  checked={action === 'copy'}
                  onChange={() => setAction('copy')}
                  className="hidden"
                />
                <Copy className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold">Copy photos (Safest)</div>
                  <div className="text-gray-500 text-[11px]">Copies files to destination without modifying originals</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  action === 'move'
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="move"
                  checked={action === 'move'}
                  onChange={() => setAction('move')}
                  className="hidden"
                />
                <FolderUp className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold">Move photos</div>
                  <div className="text-gray-500 text-[11px]">Moves files out of original folder to destination</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  action === 'xmp'
                    ? 'bg-emerald-600/15 border-emerald-500 text-white'
                    : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="xmp"
                  checked={action === 'xmp'}
                  onChange={() => setAction('xmp')}
                  className="hidden"
                />
                <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold flex items-center gap-2">
                    <span>Standard XMP Sidecars (.xmp)</span>
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">Non-Destructive</span>
                  </div>
                  <div className="text-gray-400 text-[11px] mt-0.5">Writes 5★ & Green for Accepted, 1★ & Red for Rejected directly into standard .xmp sidecars next to your original files. Zero files moved!</div>
                </div>
              </label>

              {scope === 'rejected' && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    action === 'trash'
                      ? 'bg-rose-600/15 border-rose-500 text-white'
                      : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value="trash"
                    checked={action === 'trash'}
                    onChange={() => setAction('trash')}
                    className="hidden"
                  />
                  <Trash2 className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <div className="text-xs">
                    <div className="font-semibold">Send to OS Trash</div>
                    <div className="text-gray-500 text-[11px]">Safely moves rejected files into the system trash bin</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Destination folder */}
          {action !== 'trash' && action !== 'xmp' && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                Destination Folder
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={destFolder}
                  readOnly
                  placeholder="Select output folder..."
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 truncate font-mono"
                />
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  disabled={exporting}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Browse
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live export progress */}
        {exporting && exportProgress && (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white">
                Exporting {exportProgress.progress} of {exportProgress.total} photos...
              </span>
              <span className="text-xs font-mono text-emerald-400">{progressPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {exportProgress.message && (
              <p className="mt-2 text-[11px] text-gray-500 truncate">{exportProgress.message}</p>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || targetPhotos.length === 0}
            className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              action === 'trash'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
            } disabled:opacity-50`}
          >
            {action === 'trash' ? <Trash2 className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {exporting
              ? 'Processing...'
              : action === 'trash'
              ? `Move ${targetPhotos.length} to Trash`
              : action === 'xmp'
              ? `Write ${targetPhotos.length} XMP Sidecar${targetPhotos.length === 1 ? '' : 's'}`
              : scope === 'tagged' || scope === 'tagged_selected'
              ? `Export ${targetPhotos.length} Tagged Photo${targetPhotos.length === 1 ? '' : 's'}`
              : `Export ${targetPhotos.length} Photo${targetPhotos.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportModal
