import React, { useState } from 'react'
import { Target, X, CheckCircle2, Bookmark, Clock, Camera, Sparkles, Sliders, RefreshCw, AlertCircle } from 'lucide-react'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
import toast from 'react-hot-toast'
import type { TargetQuotaResult, CameraAlignmentResponse } from '../types/photo'
import clsx from 'clsx'

interface Props {
  onClose: () => void
}

const PRESET_COUNTS = [150, 300, 500, 750, 1000]

export default function TargetDeliveryModal({ onClose }: Props) {
  const { loadPhotos, folders, filters } = usePhotosStore()
  const [tab, setTab] = useState<'quota' | 'multicam'>('quota')
  
  // Quota state
  const [targetCount, setTargetCount] = useState<number>(500)
  const [selectedFolder, setSelectedFolder] = useState<string>(filters.folder || '')
  const [preserveStoryArc, setPreserveStoryArc] = useState<boolean>(true)
  const [isApplying, setIsApplying] = useState<boolean>(false)
  const [quotaResult, setQuotaResult] = useState<TargetQuotaResult | null>(null)

  // Multi-camera state
  const [isAligning, setIsAligning] = useState<boolean>(false)
  const [alignmentResult, setAlignmentResult] = useState<CameraAlignmentResponse | null>(null)

  const handleApplyQuota = async () => {
    if (targetCount <= 0) {
      toast.error('Please enter a target count greater than 0')
      return
    }

    setIsApplying(true)
    try {
      const res = await api.applyTargetQuota({
        target_count: targetCount,
        folder: selectedFolder || undefined,
        preserve_story_arc: preserveStoryArc
      })
      setQuotaResult(res)
      toast.success(res.message || `Target delivery applied: ${res.accepted_count} photos accepted!`)
      await loadPhotos()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to apply target quota')
    } finally {
      setIsApplying(false)
    }
  }

  const handleAlignCameras = async () => {
    setIsAligning(true)
    try {
      const res = await api.alignCameras(selectedFolder || undefined)
      setAlignmentResult(res)
      toast.success(res.message || 'Multi-camera clocks synchronized!')
      await loadPhotos()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to align cameras')
    } finally {
      setIsAligning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Target size={18} />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Delivery & Output Constraints</h2>
              <p className="text-xs text-neutral-400">Target count delivery & multi-camera timeline synchronization</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-neutral-800 px-6 bg-neutral-950/40">
          <button
            onClick={() => setTab('quota')}
            className={clsx(
              'py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer',
              tab === 'quota'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            )}
          >
            <Target size={14} />
            <span>Target Delivery Quota</span>
          </button>
          <button
            onClick={() => setTab('multicam')}
            className={clsx(
              'py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer',
              tab === 'multicam'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            )}
          >
            <Camera size={14} />
            <span>Multi-Camera Sync</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {tab === 'quota' ? (
            <>
              {/* Description */}
              <div className="p-3.5 bg-indigo-950/30 border border-indigo-900/40 rounded-xl text-xs text-indigo-200 leading-relaxed flex items-start gap-2.5">
                <Sparkles size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Magic Number Delivery:</strong> Guarantees an exact delivery quota (e.g. 500 photos)
                  distributed proportionally across detected story chapters (morning prep, ceremony, speeches, reception)
                  so no part of the day is under-represented.
                </div>
              </div>

              {/* Target count input & presets */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Target Photos to Deliver
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={targetCount}
                    onChange={(e) => setTargetCount(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-32 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    {PRESET_COUNTS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setTargetCount(preset)}
                        className={clsx(
                          'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                          targetCount === preset
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-600/30'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scope / Folder */}
              {folders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Target Shoot / Folder
                  </label>
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">📁 All Folders in Library</option>
                    {folders.map((f) => (
                      <option key={f.path} value={f.path}>
                        📁 {f.name} ({f.count} photos)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preserve story arc checkbox */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950/60 border border-neutral-800 rounded-xl">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Preserve Story Arc</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    Distribute quotas proportionally across chronological scenes so early scenes aren't skipped.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preserveStoryArc}
                  onChange={(e) => setPreserveStoryArc(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Action Button */}
              <button
                onClick={handleApplyQuota}
                disabled={isApplying}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isApplying ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Calculating Proportional Scene Quotas...</span>
                  </>
                ) : (
                  <>
                    <Target size={14} />
                    <span>Apply Delivery Quota ({targetCount} Keepers)</span>
                  </>
                )}
              </button>

              {/* Quota Results Breakdown */}
              {quotaResult && (
                <div className="mt-4 p-4 bg-neutral-950 border border-emerald-800/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Quota Applied Successfully
                    </span>
                    <span className="text-xs font-mono text-neutral-300">
                      {quotaResult.accepted_count} / {quotaResult.target_requested} Keepers
                    </span>
                  </div>

                  {quotaResult.scene_breakdown && Object.keys(quotaResult.scene_breakdown).length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                      <div className="text-[11px] font-medium text-neutral-400">Scene Allocation:</div>
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {Object.entries(quotaResult.scene_breakdown).map(([sId, sc]) => (
                          <div
                            key={sId}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-neutral-900 border border-neutral-800/80"
                          >
                            <span className="text-neutral-300 font-medium truncate max-w-[220px]">
                              {sc.scene_name}
                            </span>
                            <span className="text-neutral-400 font-mono">
                              <strong className="text-emerald-400">{sc.accepted}</strong> / {sc.total} photos ({sc.quota} quota)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Multi-Camera Sync Description */}
              <div className="p-3.5 bg-blue-950/30 border border-blue-900/40 rounded-xl text-xs text-blue-200 leading-relaxed flex items-start gap-2.5">
                <Camera size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Second-Shooter Clock Alignment:</strong> Automatically detects unsynchronized internal
                  clocks across camera bodies (e.g. Second Shooter clock running 42s ahead) and aligns the chronological
                  timeline so photos interleave accurately.
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleAlignCameras}
                disabled={isAligning}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAligning ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Analyzing Inter-Camera Clock Drift...</span>
                  </>
                ) : (
                  <>
                    <Clock size={14} />
                    <span>Synchronize Multi-Camera Timelines</span>
                  </>
                )}
              </button>

              {/* Alignment Results */}
              {alignmentResult && (
                <div className="mt-4 p-4 bg-neutral-950 border border-blue-800/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Timelines Aligned
                    </span>
                    <span className="text-xs text-neutral-400">
                      {alignmentResult.cameras_detected.length} camera bodies detected
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                    <div className="text-[11px] font-medium text-neutral-400">Calculated Offsets:</div>
                    {Object.entries(alignmentResult.offsets_applied).map(([camera, offset]) => (
                      <div
                        key={camera}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-neutral-900 border border-neutral-800"
                      >
                        <span className="text-neutral-200 font-medium">{camera}</span>
                        <span className="font-mono text-blue-300 font-semibold">
                          {offset > 0 ? `+${offset}s` : `${offset}s`} offset
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
