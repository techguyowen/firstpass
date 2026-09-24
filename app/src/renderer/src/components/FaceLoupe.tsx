import React, { useEffect, useState } from 'react'
import {
  Eye, EyeOff, Users, ZoomIn, Smile, Crown, ExternalLink,
  PanelBottom, X, Minimize2, Maximize2, Sliders, Check, Anchor
} from 'lucide-react'
import { api } from '../api/client'
import type { FaceCrop } from '../types/photo'
import toast from 'react-hot-toast'
import DraggablePanel from './DraggablePanel'
import clsx from 'clsx'

export interface FaceLoupeProps {
  photoId: number
  onSelectFace?: (box: [number, number, number, number], faceIndex?: number, isVip?: boolean) => void
  onResetZoom?: () => void
  zoomLevel?: number
  isFloating?: boolean
  onToggleFloating?: () => void
  onDockToSidebar?: () => void
  onDockToBottom?: () => void
  onClose?: () => void
  layout?: 'row' | 'sidebar'
  hideHeader?: boolean
}

export function getUnpinnedVipKeys(): Set<string> {
  try {
    const raw = localStorage.getItem('photo_culler_unpinned_vips')
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

export function saveUnpinnedVipKeys(keys: Set<string>): void {
  try {
    localStorage.setItem('photo_culler_unpinned_vips', JSON.stringify(Array.from(keys)))
  } catch {}
}

export async function toggleVipFaceStatus(photoId: number, faceIndex: number, currentIsVip: boolean): Promise<boolean> {
  const willBeVip = !currentIsVip
  const unpinnedKeys = getUnpinnedVipKeys()
  if (!willBeVip) {
    unpinnedKeys.add(`${photoId}-${faceIndex}`)
  } else {
    unpinnedKeys.delete(`${photoId}-${faceIndex}`)
  }
  saveUnpinnedVipKeys(unpinnedKeys)

  try {
    if (!willBeVip) {
      await api.removeVipFaceByPhoto(photoId, faceIndex).catch(() => {})
      toast(`Face #${faceIndex + 1} unpinned from VIP`, { icon: '⚪' })
    } else {
      await api.addVipFace(photoId, faceIndex, `VIP Face ${faceIndex + 1}`)
      toast.success(`Face #${faceIndex + 1} pinned as VIP ⭐`)
    }
    return willBeVip
  } catch {
    // Revert
    if (willBeVip) {
      unpinnedKeys.add(`${photoId}-${faceIndex}`)
    } else {
      unpinnedKeys.delete(`${photoId}-${faceIndex}`)
    }
    saveUnpinnedVipKeys(unpinnedKeys)
    toast.error(willBeVip ? 'Could not pin VIP' : 'Could not unpin VIP')
    return currentIsVip
  }
}

export const FaceLoupe: React.FC<FaceLoupeProps> = ({
  photoId,
  onSelectFace,
  onResetZoom,
  zoomLevel = 1,
  isFloating = false,
  onToggleFloating,
  onDockToSidebar,
  onDockToBottom,
  onClose,
  layout = 'row',
  hideHeader = false
}) => {
  const [faces, setFaces] = useState<FaceCrop[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [togglingVipIndex, setTogglingVipIndex] = useState<number | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; face: FaceCrop } | null>(null)
  const [bottomContextMenu, setBottomContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Tear-off drag handler for bottom/sidebar dock: dragging onto canvas floats the window
  const handleTearOffMouseDown = (e: React.MouseEvent, direction: 'up' | 'left' = 'up') => {
    if (!onToggleFloating) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    const startY = e.clientY
    const startX = e.clientX

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaY = startY - ev.clientY
      const deltaX = Math.abs(startX - ev.clientX)

      if ((direction === 'up' && deltaY > 35) || (direction === 'left' && deltaX > 35)) {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        onToggleFloating()
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Reset selected index if photoId changes
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    Promise.all([
      api.getPhotoFaces(photoId),
      api.getVipFaces().catch(() => ({ vip_faces: [] }))
    ])
      .then(([res, vipRes]) => {
        if (isMounted) {
          const vips = vipRes?.vip_faces || []
          const vipMap = new Map<number, number>()
          vips.filter((v: any) => v.photo_id === photoId).forEach((v: any) => vipMap.set(v.face_index, v.id))
          const unpinnedKeys = getUnpinnedVipKeys()

          const enhancedFaces = (res.faces || []).map((f: FaceCrop) => {
            const isKeyUnpinned = unpinnedKeys.has(`${photoId}-${f.index}`)
            const hasVip = vipMap.has(f.index)
            const isVip = isKeyUnpinned ? false : (hasVip || Boolean(f.is_vip))
            return {
              ...f,
              is_vip: isVip,
              vip_id: isKeyUnpinned ? null : (vipMap.get(f.index) || f.vip_id || null)
            }
          })
          setFaces(enhancedFaces)
          setSelectedIdx(null)
        }
      })
      .catch((err) => {
        console.error('Error fetching face crops:', err)
        if (isMounted) setFaces([])
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [photoId])

  // Sync selectedIdx if zoomLevel drops back to 1
  useEffect(() => {
    if (zoomLevel <= 1 && selectedIdx !== null) {
      setSelectedIdx(null)
    }
  }, [zoomLevel])

  // Keyboard navigation across faces with [ and ]
  useEffect(() => {
    if (faces.length === 0) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

      if (e.key === ']' || e.key === '}') {
        e.preventDefault()
        const nextIdx = selectedIdx === null ? 0 : (selectedIdx + 1) % faces.length
        setSelectedIdx(nextIdx)
        if (onSelectFace && faces[nextIdx]) onSelectFace(faces[nextIdx].box, faces[nextIdx].index, faces[nextIdx].is_vip)
      } else if (e.key === '[' || e.key === '{') {
        e.preventDefault()
        const prevIdx = selectedIdx === null ? faces.length - 1 : (selectedIdx - 1 + faces.length) % faces.length
        setSelectedIdx(prevIdx)
        if (onSelectFace && faces[prevIdx]) onSelectFace(faces[prevIdx].box, faces[prevIdx].index, faces[prevIdx].is_vip)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [faces, selectedIdx, onSelectFace])

  // Pin / Unpin VIP toggle handler
  const handleToggleVip = async (e: React.MouseEvent, face: FaceCrop) => {
    e.stopPropagation()
    if (!photoId || togglingVipIndex !== null) return

    const willBeVip = !face.is_vip
    setTogglingVipIndex(face.index)

    // Immediate optimistic update
    setFaces(prev => prev.map(f => f.index === face.index ? { ...f, is_vip: willBeVip } : f))

    try {
      if (!willBeVip) {
        // Unpin VIP
        const unpinnedKeys = getUnpinnedVipKeys()
        unpinnedKeys.add(`${photoId}-${face.index}`)
        saveUnpinnedVipKeys(unpinnedKeys)

        let targetVipId = face.vip_id
        if (!targetVipId) {
          try {
            const { vip_faces } = await api.getVipFaces()
            const matched = (vip_faces || []).find((v: any) => v.photo_id === photoId && v.face_index === face.index)
            if (matched) targetVipId = matched.id
          } catch {}
        }
        if (targetVipId) {
          await api.removeVipFace(targetVipId).catch(() => {})
        }
        await api.removeVipFaceByPhoto(photoId, face.index).catch(() => {})
        setFaces(prev => prev.map(f => f.index === face.index ? { ...f, is_vip: false, vip_id: null } : f))
        toast(`Face #${face.index + 1} unpinned from VIP`, { icon: '⚪' })
      } else {
        // Pin VIP
        const unpinnedKeys = getUnpinnedVipKeys()
        unpinnedKeys.delete(`${photoId}-${face.index}`)
        saveUnpinnedVipKeys(unpinnedKeys)

        const res = await api.addVipFace(photoId, face.index, `VIP Face ${face.index + 1}`)
        setFaces(prev => prev.map(f => f.index === face.index ? { ...f, is_vip: true, vip_id: res.id } : f))
        toast.success(`Face #${face.index + 1} pinned as VIP ⭐`)
      }
    } catch {
      // Revert on error
      const unpinnedKeys = getUnpinnedVipKeys()
      if (willBeVip) {
        unpinnedKeys.add(`${photoId}-${face.index}`)
      } else {
        unpinnedKeys.delete(`${photoId}-${face.index}`)
      }
      saveUnpinnedVipKeys(unpinnedKeys)
      setFaces(prev => prev.map(f => f.index === face.index ? { ...f, is_vip: !willBeVip } : f))
      toast.error(willBeVip ? 'Could not pin VIP' : 'Could not unpin VIP')
    } finally {
      setTogglingVipIndex(null)
    }
  }

  // Handle clicking face crop to toggle zoom
  const handleClickFace = (face: FaceCrop) => {
    if (selectedIdx === face.index && zoomLevel > 1) {
      // Already zoomed into this face: zoom back out to fit
      setSelectedIdx(null)
      if (onResetZoom) onResetZoom()
    } else {
      setSelectedIdx(face.index)
      if (onSelectFace) onSelectFace(face.box, face.index, face.is_vip)
    }
  }

  if (!loading && faces.length === 0) {
    return null
  }

  const isSidebar = layout === 'sidebar'
  const activeFace = (selectedIdx !== null ? faces.find(f => f.index === selectedIdx) : null) || faces[0]

  // Render cards (row mode fills the dock height; never clip vertically)
  const faceCards = (
    <div className={clsx(
      "gap-2",
      isSidebar
        ? "grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1"
        : "h-full flex items-center overflow-x-auto overflow-y-hidden py-1 scrollbar-thin scrollbar-thumb-neutral-700"
    )}>
      {faces.map((face) => {
        const isSelected = selectedIdx === face.index && zoomLevel > 1
        const isTogglingThis = togglingVipIndex === face.index
        return (
          <div
            key={face.index}
            onClick={() => handleClickFace(face)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, face })
            }}
            className={clsx(
              'relative group flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 border-2 cursor-pointer select-none bg-neutral-950',
              isSidebar ? 'aspect-square w-full' : 'w-20 h-20 sm:w-22 sm:h-22',
              isSelected
                ? 'border-indigo-400 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/40 scale-[1.03] z-10'
                : 'border-neutral-800 hover:border-neutral-500'
            )}
            title={isSelected ? `Subject #${face.index + 1} (Zoomed 100% - click to fit)` : `Subject #${face.index + 1} (Click to zoom 100%)`}
          >
            {/* 100% Face Crop Image */}
            <img
              src={api.getFaceCropUrl(photoId, face.index, Array.isArray(face.box) ? face.box.join('-') : String(face.index))}
              alt={`Subject ${face.index + 1}`}
              className="w-full h-full object-cover bg-neutral-950"
              loading="eager"
              draggable={false}
            />

            {/* Corner 1: VIP Pin / Unpin Button (Top-Left) */}
            <div className="absolute top-1 left-1 z-20">
              {face.is_vip ? (
                <button
                  type="button"
                  onClick={(e) => handleToggleVip(e, face)}
                  disabled={isTogglingThis}
                  className="group/vip px-1.5 py-0.5 rounded-full bg-amber-500 hover:bg-rose-600 text-neutral-950 hover:text-white shadow-md transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                  title="VIP Subject — Click to Unpin VIP"
                  aria-label="Unpin VIP face"
                >
                  {isTogglingThis ? (
                    <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Crown className="w-3 h-3 stroke-[2.5] group-hover/vip:hidden" />
                      <X className="w-3 h-3 stroke-[2.5] hidden group-hover/vip:block" />
                      <span className="group-hover/vip:hidden">VIP</span>
                      <span className="hidden group-hover/vip:inline">Unpin</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleToggleVip(e, face)}
                  disabled={isTogglingThis}
                  className="px-1.5 py-0.5 rounded-full bg-black/80 hover:bg-amber-500 text-neutral-300 hover:text-neutral-950 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-md flex items-center gap-1 text-[10px] font-semibold"
                  title="Pin as VIP Subject"
                  aria-label="Pin as VIP face"
                >
                  {isTogglingThis ? (
                    <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Crown className="w-3 h-3 stroke-[2]" />
                      <span>Pin</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Corner 2: Eye Status Badge (Top-Right) */}
            <div
              className={clsx(
                "absolute top-1 right-1 p-0.5 rounded-full text-[10px] z-10 shadow-sm",
                face.has_closed_eyes
                  ? "bg-rose-500/90 text-white animate-pulse"
                  : "bg-emerald-500/90 text-white"
              )}
              title={face.has_closed_eyes ? "Eyes closed or blinking detected" : "Eyes open and sharp"}
            >
              {face.has_closed_eyes ? (
                <EyeOff className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
            </div>

            {/* Smile Badge (if smiling) */}
            {face.is_smiling && (
              <div
                className="absolute bottom-5 left-1 p-0.5 rounded-full bg-amber-500/90 text-neutral-950 text-[10px] z-10 shadow"
                title={`Smiling (${Math.round(face.smile_score || 0)}%)`}
              >
                <Smile className="w-3 h-3 stroke-[2.5]" />
              </div>
            )}

            {/* Hover overlay hint */}
            <div className="absolute inset-0 bg-indigo-600/15 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity flex items-center justify-center">
              {isSelected ? (
                <span className="bg-black/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow">Fit 1x</span>
              ) : (
                <span className="bg-black/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow">Zoom 100%</span>
              )}
            </div>

            {/* Subject Index & Sharpness Tag (Bottom Bar) */}
            <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-neutral-300 text-center py-0.5 font-mono flex items-center justify-around z-10">
              <span className={isSelected ? 'text-indigo-300 font-bold' : ''}>#{face.index + 1}</span>
              {face.sharpness !== undefined && face.sharpness > 0 && (
                <span className="text-neutral-400 font-normal">{Math.round(face.sharpness)}s</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  // Dedicated Active Face Action Bar with explicit Unpin VIP and Zoom controls
  const activeFaceControls = activeFace && (
    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-neutral-800/80 text-xs select-none">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-neutral-200 text-xs">
          Face #{activeFace.index + 1}
        </span>
        {activeFace.is_vip ? (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
            <Crown size={10} /> VIP
          </span>
        ) : (
          <span className="text-neutral-500 text-[11px]">Standard</span>
        )}
        {activeFace.has_closed_eyes && (
          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
            <EyeOff size={10} /> Blink
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Explicit Unpin VIP / Pin as VIP Button */}
        {activeFace.is_vip ? (
          <button
            type="button"
            onClick={(e) => handleToggleVip(e, activeFace)}
            disabled={togglingVipIndex === activeFace.index}
            className="px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-600/70 text-rose-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            title="Unpin this subject from VIP list"
          >
            <X size={12} strokeWidth={2.5} />
            <span>Unpin VIP</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => handleToggleVip(e, activeFace)}
            disabled={togglingVipIndex === activeFace.index}
            className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-600/70 text-amber-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            title="Pin this subject as VIP"
          >
            <Crown size={12} strokeWidth={2} />
            <span>Pin VIP</span>
          </button>
        )}

        {/* Zoom 100% / Fit 1x Button */}
        <button
          type="button"
          onClick={() => handleClickFace(activeFace)}
          className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
          title={selectedIdx === activeFace.index && zoomLevel > 1 ? "Reset zoom to fit image" : "Zoom into this face at 100%"}
        >
          {selectedIdx === activeFace.index && zoomLevel > 1 ? (
            <>
              <Minimize2 size={11} />
              <span>Fit (1x)</span>
            </>
          ) : (
            <>
              <ZoomIn size={11} />
              <span>Zoom 100%</span>
            </>
          )}
        </button>
      </div>
    </div>
  )

  // Context Menu Dropdown on right click
  const contextMenuPortal = contextMenu && (
    <>
      <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
      <div
        className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1 text-xs min-w-[170px]"
        style={{
          top: Math.min(window.innerHeight - 130, contextMenu.y),
          left: Math.min(window.innerWidth - 190, contextMenu.x)
        }}
      >
        <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
          Subject #{contextMenu.face.index + 1}
        </div>
        <button
          onClick={(e) => {
            handleToggleVip(e, contextMenu.face)
            setContextMenu(null)
          }}
          className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
        >
          {contextMenu.face.is_vip ? (
            <>
              <X size={13} className="text-rose-400" />
              <span className="text-rose-300 font-medium">Unpin from VIP</span>
            </>
          ) : (
            <>
              <Crown size={13} className="text-amber-400" />
              <span>Pin as VIP Subject</span>
            </>
          )}
        </button>
        <button
          onClick={() => {
            handleClickFace(contextMenu.face)
            setContextMenu(null)
          }}
          className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
        >
          <ZoomIn size={13} className="text-indigo-400" />
          <span>{selectedIdx === contextMenu.face.index && zoomLevel > 1 ? 'Reset Zoom (Fit)' : 'Zoom to Face (100%)'}</span>
        </button>
      </div>
    </>
  )

  // 1. Sidebar Mode: Clean embed inside Inspector sidebar
  if (isSidebar) {
    return (
      <div className="mt-2 pt-2 border-t border-neutral-800/80">
        <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
          <div className="flex items-center gap-1.5 font-medium">
            <ZoomIn size={12} className="text-indigo-400" />
            <span>Face Loupe ({faces.length})</span>
          </div>
          <div className="flex items-center gap-1">
            {(onDockToBottom || onDockToSidebar) && (
              <button
                type="button"
                onClick={onDockToBottom || onDockToSidebar}
                className="flex items-center gap-1 text-[10px] text-neutral-300 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 cursor-pointer transition-colors border border-neutral-700/60"
                title="Snap Face Loupe back to bottom stage area"
              >
                <Anchor size={10} className="text-blue-400" />
                <span>Snap Bottom</span>
              </button>
            )}
            {onToggleFloating && (
              <button
                type="button"
                onClick={onToggleFloating}
                className="flex items-center gap-1 text-[10px] text-neutral-300 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 cursor-pointer transition-colors border border-neutral-700/60"
                title="Float Face Loupe as movable window"
              >
                <ExternalLink size={10} />
                <span>Float</span>
              </button>
            )}
          </div>
        </div>
        {faceCards}
        {activeFaceControls}
        {contextMenuPortal}
      </div>
    )
  }

  // 2. Floating Panel Mode: Movable draggable window
  if (isFloating) {
    const isZoomed = zoomLevel > 1

    return (
      <>
        <DraggablePanel
          title={`Face Loupe (${faces.length})`}
          icon={<Users size={13} className="text-indigo-400" />}
          storageKey="photo_culler_faceloupe_pos"
          defaultPosition={{ x: 60, y: Math.max(60, window.innerHeight - 240) }}
          width={Math.max(300, Math.min(620, faces.length * 96 + 48))}
          isOpen={true}
          onClose={onClose || onToggleFloating}
          supportedDockZones={['bottom', 'sidebar']}
          onSnapDock={(zone) => {
            if (zone === 'bottom') {
              if (onDockToBottom) onDockToBottom()
              else if (onToggleFloating) onToggleFloating()
            } else if (zone === 'sidebar' && onDockToSidebar) {
              onDockToSidebar()
            }
          }}
          className={clsx(
            "transition-opacity duration-200 shadow-2xl",
            isZoomed && "opacity-50 hover:opacity-100"
          )}
          headerControls={
            <div className="flex items-center gap-1 mr-1">
              {/* Snap back to Bottom Stage */}
              {(onDockToBottom || onToggleFloating) && (
                <button
                  type="button"
                  onClick={onDockToBottom || onToggleFloating}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:text-white rounded bg-neutral-800/80 hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700/60"
                  title="Snap Face Loupe back to bottom default area"
                >
                  <Anchor size={10} className="text-blue-400" />
                  <span>Snap Bottom</span>
                </button>
              )}
              {/* Dock to Inspector Sidebar */}
              {onDockToSidebar && (
                <button
                  type="button"
                  onClick={onDockToSidebar}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:text-white rounded bg-neutral-800/80 hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700/60"
                  title="Dock Face Loupe inside Inspector Sidebar"
                >
                  <Sliders size={10} />
                  <span>To Sidebar</span>
                </button>
              )}
              {/* Minimize / Expand */}
              <button
                type="button"
                onClick={() => setIsMinimized(prev => !prev)}
                className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer ml-0.5"
                title={isMinimized ? "Expand Face Loupe" : "Minimize Face Loupe"}
              >
                {isMinimized ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
              </button>
            </div>
          }
        >
          {!isMinimized ? (
            <div>
              {faceCards}
              {activeFaceControls}
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-neutral-500 select-none">
                <span>Right-click face for unpin / options</span>
                <span>[ ] Previous / Next</span>
              </div>
            </div>
          ) : (
            <div className="py-1 flex items-center justify-between text-xs text-neutral-400">
              <span>{faces.length} faces detected</span>
              <button
                onClick={() => setIsMinimized(false)}
                className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
              >
                Expand
              </button>
            </div>
          )}
        </DraggablePanel>
        {contextMenuPortal}
      </>
    )
  }

  // 3. Bottom Docked Mode: Clean bar under the photo stage
  // If user collapsed bottom loupe to maximize canvas during zoom:
  if (isBottomCollapsed) {
    return (
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setBottomContextMenu({ x: e.clientX, y: e.clientY })
        }}
        className="bg-neutral-900/90 backdrop-blur border border-neutral-800 rounded-lg px-3 py-1 flex items-center justify-between text-xs text-neutral-300 shadow-xl select-none"
      >
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium">Face Loupe ({faces.length})</span>
          <span className="text-neutral-500 text-[11px] hidden sm:inline">— Collapsed for full viewport</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsBottomCollapsed(false)}
            className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Maximize2 size={11} />
            <span>Expand Loupe</span>
          </button>
          {onDockToSidebar && (
            <button
              type="button"
              onClick={onDockToSidebar}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] cursor-pointer transition-colors"
            >
              To Sidebar
            </button>
          )}
        </div>
      </div>
    )
  }

  if (hideHeader) {
    return (
      <div className="h-full min-h-0 flex flex-col justify-center overflow-hidden select-none">
        {faceCards}
        {contextMenuPortal}
      </div>
    )
  }

  return (
    <div className="bg-neutral-900/90 backdrop-blur border border-neutral-800 rounded-xl p-2.5 shadow-2xl relative select-none">
      <div
        onMouseDown={(e) => handleTearOffMouseDown(e, 'up')}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setBottomContextMenu({ x: e.clientX, y: e.clientY })
        }}
        className="flex items-center justify-between mb-1.5 text-xs text-neutral-400 cursor-grab active:cursor-grabbing group/header"
        title="Drag upward onto canvas to float window, or right-click for options"
      >
        <div className="flex items-center gap-2 font-medium">
          <Users className="w-3.5 h-3.5 text-indigo-400 group-hover/header:text-blue-400 transition-colors" />
          <span className="group-hover/header:text-neutral-200 transition-colors">Face Loupe ({faces.length})</span>
          <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">
            Drag up to float · Click face to zoom 100% · [ ] navigate
          </span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Collapse button during zoom */}
          <button
            type="button"
            onClick={() => setIsBottomCollapsed(true)}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Minimize Face Loupe bar for full viewport view"
          >
            <Minimize2 size={12} />
          </button>
          {onDockToSidebar && (
            <button
              type="button"
              onClick={onDockToSidebar}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Move Face Loupe into Inspector Sidebar"
            >
              <Sliders size={11} />
              <span className="hidden md:inline">To Sidebar</span>
            </button>
          )}
          {onToggleFloating && (
            <button
              type="button"
              onClick={onToggleFloating}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:text-white rounded bg-neutral-800/80 hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700/60"
              title="Float Face Loupe as movable window"
            >
              <ExternalLink size={11} />
              <span>Float</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer ml-1"
              title="Close Face Loupe"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {faceCards}
      {activeFaceControls}
      {contextMenuPortal}

      {/* Bottom Context Menu */}
      {bottomContextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setBottomContextMenu(null)} />
          <div
            className="fixed z-[10000] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 text-xs min-w-[190px] select-none animate-in fade-in zoom-in-95 duration-75"
            style={{
              top: Math.min(window.innerHeight - 150, bottomContextMenu.y),
              left: Math.min(window.innerWidth - 200, bottomContextMenu.x),
            }}
          >
            <div className="px-3 py-1 font-semibold text-neutral-400 text-[10px] uppercase border-b border-neutral-800">
              Face Loupe Dock
            </div>
            {onToggleFloating && (
              <button
                onClick={() => {
                  setBottomContextMenu(null)
                  onToggleFloating()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-blue-300 hover:text-blue-200 cursor-pointer"
              >
                <ExternalLink size={13} className="text-blue-400" />
                <span>Float Face Loupe Window</span>
              </button>
            )}
            {onDockToSidebar && (
              <button
                onClick={() => {
                  setBottomContextMenu(null)
                  onDockToSidebar()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
              >
                <Sliders size={13} className="text-neutral-400" />
                <span>Dock into Inspector Sidebar</span>
              </button>
            )}
            <button
              onClick={() => {
                setBottomContextMenu(null)
                setIsBottomCollapsed(true)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-neutral-200 cursor-pointer"
            >
              <Minimize2 size={13} className="text-neutral-400" />
              <span>Minimize Loupe Bar</span>
            </button>
            {onClose && (
              <>
                <div className="border-t border-neutral-800 my-0.5" />
                <button
                  onClick={() => {
                    setBottomContextMenu(null)
                    onClose()
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-rose-300 hover:text-rose-200 cursor-pointer"
                >
                  <X size={13} className="text-rose-400" />
                  <span>Hide Face Loupe</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default FaceLoupe

