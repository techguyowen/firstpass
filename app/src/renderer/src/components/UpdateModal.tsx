import React, { useState, useEffect } from 'react'
import { Download, CheckCircle, AlertCircle, RefreshCw, X, Sparkles, ExternalLink } from 'lucide-react'
import { api } from '../api/client'
import type { UpdateCheckResponse, UpdateProgressResponse } from '../types/photo'

interface UpdateModalProps {
  updateInfo: UpdateCheckResponse
  onClose: () => void
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<UpdateProgressResponse>({
    status: 'idle',
    downloaded_bytes: 0,
    total_bytes: 0,
    percent: 0,
  })
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timer: any = null
    if (downloading && progress.status !== 'completed') {
      timer = setInterval(async () => {
        try {
          const res = await api.getUpdateProgress()
          setProgress(res)
          if (res.status === 'completed') {
            setDownloading(false)
            clearInterval(timer)
          } else if (res.status === 'error') {
            setError(res.error_message || 'Download failed')
            setDownloading(false)
            clearInterval(timer)
          }
        } catch {
          // ignore
        }
      }, 500)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [downloading, progress.status])

  const handleStartDownload = async () => {
    if (!updateInfo.download_url) return
    try {
      setError(null)
      setDownloading(true)
      await api.downloadUpdate(updateInfo.download_url, updateInfo.asset_name)
    } catch (err: any) {
      setError(err.message || 'Failed to start download')
      setDownloading(false)
    }
  }

  const handleInstall = async () => {
    try {
      setInstalling(true)
      await api.installUpdate()
    } catch (err: any) {
      setError(err.message || 'Failed to launch installer')
      setInstalling(false)
    }
  }

  const formatMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Glow Header */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Update Available
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                v{updateInfo.latest_version}
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Current version: v{updateInfo.current_version}
            </p>
          </div>
        </div>

        {/* Release notes */}
        <div className="bg-gray-950/60 border border-gray-800/80 rounded-xl p-4 mb-5 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Release Notes
          </h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {updateInfo.release_notes || 'Performance improvements and bug fixes.'}
          </p>
          {updateInfo.asset_size && (
            <div className="mt-3 text-xs text-gray-500">
              Download size: {formatMB(updateInfo.asset_size)}
            </div>
          )}
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Download Progress Bar */}
        {downloading && (
          <div className="mb-5 space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                Downloading update...
              </span>
              <span className="font-mono text-indigo-400">{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-500 text-right">
              {formatMB(progress.downloaded_bytes)} / {formatMB(progress.total_bytes)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            Later
          </button>

          {progress.status === 'completed' ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all duration-200"
            >
              <CheckCircle className="w-4 h-4" />
              {installing ? 'Launching Installer...' : 'Install & Relaunch'}
            </button>
          ) : (
            <button
              onClick={handleStartDownload}
              disabled={downloading || !updateInfo.download_url}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download & Install In Place'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default UpdateModal

