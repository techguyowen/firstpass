import React, { useState } from 'react'
import { FolderUp, Copy, Trash2, CheckCircle2, X, Folder, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
import toast from 'react-hot-toast'
import type { Photo } from '../types/photo'

interface ExportModalProps {
  onClose: () => void
  selectedIds?: number[]
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose, selectedIds = [] }) => {
  const { photos, loadPhotos } = usePhotosStore()
  const [scope, setScope] = useState<'accepted' | 'rejected' | 'selected'>('accepted')
  const [action, setAction] = useState<'copy' | 'move' | 'trash' | 'xmp'>('copy')
  const [destFolder, setDestFolder] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [isAutoPickingDuplicates, setIsAutoPickingDuplicates] = useState(false)

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

  const acceptedPhotos = photos.filter((p) => p.status === 'accepted')
  const rejectedPhotos = photos.filter((p) => p.status === 'rejected')

  let targetPhotos: Photo[] = []
  if (scope === 'accepted') targetPhotos = acceptedPhotos
  else if (scope === 'rejected') targetPhotos = rejectedPhotos
  else targetPhotos = photos.filter((p) => selectedIds.includes(p.id))

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
    try {
      const res = await api.exportPhotos({
        photo_ids: targetPhotos.map((p) => p.id),
        action,
        destination_folder: destFolder || undefined,
      })

      if (res.success) {
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
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-150">
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

        <div className="space-y-4">
          {/* Duplicates Auto Pick */}
          <div className="border border-neutral-700/60 rounded-xl p-4 bg-neutral-950/50">
            <h3 className="text-xs font-bold text-neutral-200 mb-1">Duplicate Handling</h3>
            <p className="text-neutral-400 text-xs mb-3">For each duplicate group, automatically keep the sharpest photo and reject the rest.</p>
            <button
              onClick={handleAutoPickDuplicates}
              disabled={isAutoPickingDuplicates}
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
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope('accepted')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  scope === 'accepted'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                Keepers ({acceptedPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('rejected')
                  if (action === 'copy') setAction('trash')
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  scope === 'rejected'
                    ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                Rejected ({rejectedPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('selected')}
                disabled={selectedIds.length === 0}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40 ${
                  scope === 'selected'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                Selected ({selectedIds.length})
              </button>
            </div>
          </div>

          {/* Action selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
              Export Action
            </label>
            <div className="space-y-2">
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
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Browse
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
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
              : `Export ${targetPhotos.length} Photo${targetPhotos.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportModal
