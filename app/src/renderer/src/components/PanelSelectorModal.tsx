import React, { useEffect } from 'react'
import { X, Check, LayoutGrid, Eye, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

export type PanelKey =
  | 'filmstrip'
  | 'cullingBar'
  | 'inspector'
  | 'hud'
  | 'histogram'
  | 'faceLoupe'
  | 'bottomDock'
  | 'quality'
  | 'camera'
  | 'reasons'

export interface PanelSelectorItem {
  key: PanelKey
  label: string
  description: string
  visible: boolean
}

interface PanelSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  items: PanelSelectorItem[]
  onToggle: (key: PanelKey) => void
  onShowAll: () => void
  onResetDefaults: () => void
}

export default function PanelSelectorModal({
  isOpen,
  onClose,
  items,
  onToggle,
  onShowAll,
  onResetDefaults,
}: PanelSelectorModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const visibleCount = items.filter((i) => i.visible).length

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-label="Customize panels"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-200">
              <LayoutGrid size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Customize Panels</h2>
              <p className="text-[11px] text-neutral-400">
                {visibleCount} of {items.length} panels visible
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onToggle(item.key)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer',
                item.visible
                  ? 'bg-neutral-800/80 border-neutral-700 hover:bg-neutral-800'
                  : 'bg-transparent border-transparent hover:bg-neutral-800/50'
              )}
              title={item.visible ? `Hide ${item.label}` : `Show ${item.label}`}
            >
              <span
                className={clsx(
                  'w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors',
                  item.visible
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-neutral-800 border-neutral-600 text-transparent'
                )}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="min-w-0">
                <span
                  className={clsx(
                    'block text-xs font-semibold truncate',
                    item.visible ? 'text-neutral-100' : 'text-neutral-500'
                  )}
                >
                  {item.label}
                </span>
                <span className="block text-[11px] text-neutral-500 truncate">
                  {item.description}
                </span>
              </span>
              <span
                className={clsx(
                  'ml-auto text-[10px] font-semibold shrink-0',
                  item.visible ? 'text-emerald-400' : 'text-neutral-600'
                )}
              >
                {item.visible ? 'Shown' : 'Hidden'}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-neutral-800 bg-neutral-950/60">
          <button
            onClick={onShowAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 transition-colors cursor-pointer"
            title="Show every panel"
          >
            <Eye size={12} />
            <span>Show All</span>
          </button>
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 transition-colors cursor-pointer"
            title="Restore the default panel layout"
          >
            <RotateCcw size={12} />
            <span>Reset to Default</span>
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-white text-neutral-900 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
