import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Check, X, RotateCcw, Tag, Crown, Pin, RefreshCw, FolderOpen, Copy
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Photo } from '../types/photo'
import { api } from '../api/client'
import { usePhotosStore } from '../store/photosStore'
import { playShutterSound, playRejectSound, playResetSound, playVipChime } from '../utils/audioFeedback'

interface PhotoContextMenuProps {
  photo: Photo
  x: number
  y: number
  onClose: () => void
}

interface MenuItem {
  key: string
  label: string
  hint?: string
  icon: React.ReactNode
  danger?: boolean
  action: () => void | Promise<void>
}

export default function PhotoContextMenu({ photo, x, y, onClose }: PhotoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const { setPhotoStatusWithUndo, togglePhotoTag, loadPhotos } = usePhotosStore()

  // Clamp into the viewport once measured.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad)),
    })
  }, [x, y])

  // Dismiss on outside click / Escape.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Defer listener attach so the opening right-click doesn't instantly close us.
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('keydown', onKeyDown, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  const run = (fn: () => void | Promise<void>) => async () => {
    try {
      await fn()
    } finally {
      onClose()
    }
  }

  const handleAccept = run(() => {
    playShutterSound()
    return setPhotoStatusWithUndo(photo.id, 'accepted')
  })
  const handleReject = run(() => {
    playRejectSound()
    return setPhotoStatusWithUndo(photo.id, 'rejected')
  })
  const handleReset = run(() => {
    playResetSound()
    return setPhotoStatusWithUndo(photo.id, 'pending')
  })
  const handleToggleTag = run(() => togglePhotoTag(photo.id))

  const handleSetBurstLeader = run(async () => {
    try {
      await api.setBurstLeader(photo.id)
      toast.success(`👑 ${photo.filename} crowned burst leader`)
      await loadPhotos()
    } catch {
      toast.error('Could not set burst leader')
    }
  })

  const handlePinVip = run(async () => {
    try {
      const { faces } = await api.getPhotoFaces(photo.id)
      if (!faces || faces.length === 0) {
        toast.error('No faces detected on this photo')
        return
      }
      const target = faces.find(f => !f.is_vip) ?? faces[0]
      await api.addVipFace(photo.id, target.index, `VIP Face ${target.index + 1}`)
      playVipChime()
      toast.success(`Face #${target.index + 1} pinned as VIP ⭐`)
    } catch {
      toast.error('Could not pin VIP face')
    }
  })

  const handleReanalyze = run(async () => {
    try {
      toast(`Re-analyzing ${photo.filename}…`, { icon: '🔄', id: `reanalyze-${photo.id}` })
      await api.reanalyzePhoto(photo.id)
      await loadPhotos()
      toast.success(`Re-analyzed ${photo.filename}`, { id: `reanalyze-${photo.id}` })
    } catch {
      toast.error('Re-analysis failed', { id: `reanalyze-${photo.id}` })
    }
  })

  const handleReveal = run(async () => {
    try {
      const ok = await window.electronAPI?.showItemInFolder?.(photo.path)
      if (!ok) toast.error('Could not reveal file in Finder')
    } catch {
      toast.error('Could not reveal file in Finder')
    }
  })

  const handleCopyPath = run(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(photo.path)
      } else {
        const ta = document.createElement('textarea')
        ta.value = photo.path
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('File path copied', { icon: '📋' })
    } catch {
      toast.error('Could not copy path')
    }
  })

  const inBurstGroup = Boolean(photo.burst_group_id)
  const hasFaces = (photo.face_count ?? 0) > 0

  const groups: MenuItem[][] = [
    [
      { key: 'accept', label: 'Accept Photo', hint: 'A', icon: <Check size={13} className="text-emerald-400" />, action: handleAccept },
      { key: 'reject', label: 'Reject Photo', hint: 'R', icon: <X size={13} className="text-rose-400" />, action: handleReject },
      { key: 'reset', label: 'Reset to Pending', hint: 'U', icon: <RotateCcw size={13} className="text-neutral-400" />, action: handleReset },
      { key: 'tag', label: photo.is_tagged ? 'Remove Tag' : 'Toggle Tag', hint: '\\', icon: <Tag size={13} className="text-amber-400" />, action: handleToggleTag },
    ],
    [
      ...(inBurstGroup
        ? [{ key: 'burst-leader', label: photo.is_burst_leader ? 'Burst Leader ✓' : 'Set as Burst Leader', icon: <Crown size={13} className="text-amber-400" />, action: handleSetBurstLeader } as MenuItem]
        : []),
      ...(hasFaces
        ? [{ key: 'pin-vip', label: 'Pin VIP Face', icon: <Pin size={13} className="text-amber-300" />, action: handlePinVip } as MenuItem]
        : []),
      { key: 'reanalyze', label: 'Re-analyze with AI', icon: <RefreshCw size={13} className="text-sky-400" />, action: handleReanalyze },
    ],
    [
      { key: 'reveal', label: 'Reveal in Finder / File Manager', icon: <FolderOpen size={13} className="text-neutral-300" />, action: handleReveal },
      { key: 'copy-path', label: 'Copy File Path', icon: <Copy size={13} className="text-neutral-300" />, action: handleCopyPath },
    ],
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      role="menu"
      aria-label={`Actions for ${photo.filename}`}
    >
      <div className="px-3 py-1.5 text-[11px] text-neutral-500 font-medium truncate border-b border-neutral-800 mb-1">
        {photo.filename}
      </div>
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="my-1 border-t border-neutral-800" />}
          {group.map(item => (
            <button
              key={item.key}
              onClick={() => void item.action()}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer hover:bg-white/5',
                item.danger ? 'text-rose-300' : 'text-neutral-200'
              )}
              role="menuitem"
            >
              <span className="shrink-0 w-4 flex items-center justify-center">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && (
                <kbd className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
                  {item.hint}
                </kbd>
              )}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}
