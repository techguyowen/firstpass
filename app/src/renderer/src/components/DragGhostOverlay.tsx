import React, { useEffect, useState } from 'react'
import { dockDragManager, DragState } from '../utils/dockDragManager'
import { MODULE_TITLES, MODULE_ICONS } from './ScorePanel'
import { Check, X, SkipForward, GripVertical, Sparkles } from 'lucide-react'

export default function DragGhostOverlay() {
  const [dragState, setDragState] = useState<DragState>(dockDragManager.getState())

  useEffect(() => {
    return dockDragManager.subscribe(setDragState)
  }, [])

  if (!dragState.isDragging || !dragState.item) {
    return null
  }

  const { item, currentPos, dropTarget } = dragState

  return (
    <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden select-none">
      {/* 1. Polished universal drop landing marquee (Adobe Premiere / ACDSee style) */}
      {dropTarget && dropTarget.type === 'side-dock' && (
        <div
          className={`absolute top-12 bottom-2 w-72 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center transition-all pointer-events-none ${
            dropTarget.side === 'left' ? 'left-16' : 'right-2'
          }`}
        >
          <div className="bg-blue-600 text-white font-semibold text-[11px] px-2.5 py-1 rounded-full shadow-lg whitespace-nowrap">
            Dock to {dropTarget.side === 'left' ? 'Left Edge' : 'Right Edge'}
          </div>
        </div>
      )}

      {dropTarget && dropTarget.type === 'sidebar-dock' && (
        <div className="absolute top-12 bottom-2 right-2 w-80 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center transition-all pointer-events-none">
          <div className="bg-blue-600 text-white font-semibold text-[11px] px-3 py-1 rounded-full shadow-xl whitespace-nowrap flex items-center gap-1.5">
            <Sparkles size={12} />
            <span>Dock into Inspector Sidebar</span>
          </div>
        </div>
      )}

      {dropTarget && dropTarget.type === 'bottom-dock' && (
        <div className="absolute bottom-2 left-20 right-4 h-32 bg-blue-500/20 border-2 border-blue-400 rounded-xl backdrop-blur-xs shadow-[0_0_30px_rgba(59,130,246,0.35)] animate-in fade-in duration-100 flex items-center justify-center transition-all pointer-events-none">
          <div className="bg-blue-600 text-white font-semibold text-[11px] px-3 py-1 rounded-full shadow-xl whitespace-nowrap flex items-center gap-1.5">
            <Sparkles size={12} />
            <span>Drop to Dock to Bottom Stage Bar</span>
          </div>
        </div>
      )}

      {/* 2. Floating Ghost Badge following cursor (tracks pointer 1:1, zero lag) */}
      <div
        className="fixed left-0 top-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(${currentPos.x + 14}px, ${currentPos.y + 14}px, 0)`,
          transition: 'none',
        }}
      >
        {item.type === 'sorting-bar' ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/95 border-2 border-blue-500 rounded-2xl shadow-2xl backdrop-blur-md text-xs text-white">
            <GripVertical size={13} className="text-blue-400" />
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="w-2 h-2 rounded-full bg-neutral-400" />
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <span className="font-semibold text-blue-200">Culling Action Bar</span>
            <span className="text-[10px] text-neutral-400 font-mono">
              {dropTarget?.type === 'side-dock'
                ? `[Side ${dropTarget.side}]`
                : dropTarget?.type === 'sidebar-dock'
                ? '[Right Sidebar]'
                : dropTarget?.type === 'bottom-dock'
                ? '[Bottom Line]'
                : dropTarget?.type === 'bottom-split'
                ? `[Split ${dropTarget.side.toUpperCase()}]`
                : dropTarget?.type === 'bottom-tab-group'
                ? '[Bottom Tab]'
                : '[Float]'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-neutral-900/95 border-2 border-blue-500 rounded-xl shadow-2xl backdrop-blur-md text-xs text-white">
            <span className="text-blue-400">{MODULE_ICONS[item.id] || <Sparkles size={13} />}</span>
            <span className="font-semibold text-neutral-100">{item.title || MODULE_TITLES[item.id] || item.id}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
              {dropTarget?.type === 'split-line'
                ? `Split (Group ${dropTarget.groupIndex + 1})`
                : dropTarget?.type === 'tab-group'
                ? 'Add as Tab'
                : dropTarget?.type === 'sidebar-dock'
                ? 'Dock to Sidebar'
                : dropTarget?.type === 'bottom-split'
                ? `Split Bottom (${dropTarget.side})`
                : dropTarget?.type === 'bottom-tab-group'
                ? 'Bottom Tab'
                : dropTarget?.type === 'bottom-dock'
                ? 'Dock Bottom'
                : 'Float Window'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
