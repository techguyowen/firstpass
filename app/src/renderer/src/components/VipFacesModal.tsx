import { useEffect, useRef, useState } from 'react'
import { X, Star, Loader2, UserCircle2 } from 'lucide-react'
import axios from 'axios'
import { api } from '../api/client'

interface VipFacesModalProps {
  isOpen: boolean
  onClose: () => void
}

interface VipFace {
  id: number
  photo_id: number
  face_index: number
  label: string | null
  thumbnail_b64: string | null
  created_at: string
}

function VipFaceCard({
  vip,
  onRemove,
}: {
  vip: VipFace
  onRemove: (id: number) => void
}) {
  const [label, setLabel] = useState(vip.label ?? '')
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function handleRemove() {
    setRemoving(true)
    try {
      try {
        const raw = localStorage.getItem('firstpass_unpinned_vips') || localStorage.getItem('photo_culler_unpinned_vips')
        const keys = raw ? new Set(JSON.parse(raw)) : new Set()
        keys.add(`${vip.photo_id}-${vip.face_index}`)
        localStorage.setItem('firstpass_unpinned_vips', JSON.stringify(Array.from(keys)))
        localStorage.setItem('photo_culler_unpinned_vips', JSON.stringify(Array.from(keys)))
      } catch {}
      await api.removeVipFace(vip.id)
      onRemove(vip.id)
    } catch {
      setRemoving(false)
    }
  }

  return (
    <div className="relative flex flex-col bg-neutral-800 rounded-xl overflow-hidden group">
      {/* Remove button */}
      <button
        onClick={handleRemove}
        disabled={removing}
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-black/80 hover:bg-rose-700 text-neutral-300 hover:text-white transition-all flex items-center gap-1 text-[11px] font-medium shadow-md cursor-pointer opacity-80 group-hover:opacity-100"
        aria-label="Unpin VIP face"
        title="Unpin this VIP face"
      >
        <X size={12} strokeWidth={2.5} />
        <span>Unpin</span>
      </button>

      {/* Face thumbnail */}
      <div className="w-full aspect-square bg-neutral-700 flex items-center justify-center overflow-hidden">
        {vip.thumbnail_b64 ? (
          <img
            src={`data:image/jpeg;base64,${vip.thumbnail_b64}`}
            alt={label || `VIP face ${vip.id}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <UserCircle2 size={40} className="text-neutral-500" />
        )}
      </div>

      {/* Info area */}
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Editable label */}
        {editing ? (
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditing(false)
            }}
            className="w-full bg-neutral-700 text-white text-[13px] rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Add label…"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-left text-[13px] text-neutral-200 hover:text-white truncate rounded px-0.5 -mx-0.5 transition-colors"
            title="Click to edit label"
          >
            {label || <span className="text-neutral-600 italic">Unnamed</span>}
          </button>
        )}

        {/* Photo chip */}
        <div className="flex items-center">
          <span className="text-[11px] text-neutral-500 bg-neutral-700 rounded-full px-2 py-0.5">
            📍 photo #{vip.photo_id}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function VipFacesModal({ isOpen, onClose }: VipFacesModalProps) {
  const [vips, setVips] = useState<VipFace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    api
      .getVipFaces()
      .then((res) => setVips((res.vip_faces ?? []) as VipFace[]))
      .catch((err: unknown) => {
        const msg = axios.isAxiosError(err)
          ? err.message
          : 'Failed to load VIP faces'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [isOpen])

  // Escape closes
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  function handleRemove(id: number) {
    setVips((prev) => prev.filter((v) => v.id !== id))
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="VIP Faces"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-xl bg-neutral-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-neutral-800 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-white font-semibold text-lg">
              <Star size={18} className="text-yellow-400 fill-yellow-400" />
              VIP Faces
            </div>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              Faces pinned as primary subjects
            </p>
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
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

          {!loading && !error && vips.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
              <Star size={36} className="text-neutral-700" />
              <div className="space-y-1">
                <p className="text-neutral-400 text-sm">No VIP faces pinned yet.</p>
                <p className="text-neutral-600 text-[12px]">
                  Open any photo in Review and click 📌 on a face to pin it.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && vips.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {vips.map((vip) => (
                <VipFaceCard key={vip.id} vip={vip} onRemove={handleRemove} />
              ))}
            </div>
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
