import React, { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, Check, Eye, Camera, FileText, Award, Tag, Bookmark, Layers } from 'lucide-react'
import { usePhotosStore } from '../store/photosStore'
import clsx from 'clsx'

export default function ViewOptionsMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { viewOptions, setViewOptions } = usePhotosStore()

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const ToggleRow = ({
    icon: Icon,
    label,
    checked,
    onChange,
  }: {
    icon: any
    label: string
    checked: boolean
    onChange: (val: boolean) => void
  }) => (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between py-1.5 px-2 hover:bg-neutral-800/60 rounded-lg cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 text-xs text-neutral-300">
        <Icon size={14} className="text-neutral-400" />
        <span>{label}</span>
      </div>
      <div
        className={clsx(
          'w-8 h-4.5 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer',
          checked ? 'bg-indigo-600' : 'bg-neutral-700'
        )}
      >
        <div
          className={clsx(
            'w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm',
            checked ? 'translate-x-3.5' : 'translate-x-0'
          )}
        />
      </div>
    </div>
  )

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer outline-none focus:outline-none',
          open
            ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700'
        )}
        title="Customize grid layout and visible card details"
      >
        <SlidersHorizontal size={13} />
        <span>View Options</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl z-50 p-3 text-neutral-200 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-2 pb-2 mb-2 border-b border-neutral-800">
            Grid Columns
          </div>

          {/* Column Density Buttons */}
          <div className="grid grid-cols-4 gap-1.5 px-1 mb-3">
            {[3, 4, 5, 6].map((cols) => (
              <button
                key={cols}
                onClick={() => setViewOptions({ columns: cols })}
                className={clsx(
                  'py-1.5 text-xs font-bold rounded-lg border transition-all flex flex-col items-center justify-center cursor-pointer',
                  viewOptions.columns === cols
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                    : 'bg-neutral-800 border-neutral-700/70 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-750'
                )}
              >
                <span>{cols}</span>
                <span className="text-[9px] font-normal opacity-75">
                  {cols === 3 ? 'Large' : cols === 4 ? 'Default' : cols === 5 ? 'Dense' : 'Compact'}
                </span>
              </button>
            ))}
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-2 py-1 border-t border-neutral-800 mt-2 mb-1">
            Display on Cards
          </div>

          <div className="space-y-0.5">
            <ToggleRow
              icon={FileText}
              label="Filenames"
              checked={viewOptions.showFilename}
              onChange={(val) => setViewOptions({ showFilename: val })}
            />
            <ToggleRow
              icon={Camera}
              label="Camera EXIF Info"
              checked={viewOptions.showExif}
              onChange={(val) => setViewOptions({ showExif: val })}
            />
            <ToggleRow
              icon={Award}
              label="Score Badges"
              checked={viewOptions.showScoreBadge}
              onChange={(val) => setViewOptions({ showScoreBadge: val })}
            />
            <ToggleRow
              icon={Tag}
              label="AI Quality Chips"
              checked={viewOptions.showAiChips}
              onChange={(val) => setViewOptions({ showAiChips: val })}
            />
            <ToggleRow
              icon={Bookmark}
              label="Scene Chapter Headers"
              checked={viewOptions.showChapters}
              onChange={(val) => setViewOptions({ showChapters: val })}
            />
            <ToggleRow
              icon={Layers}
              label="Stack Burst Sequences"
              checked={viewOptions.collapseBursts ?? true}
              onChange={(val) => setViewOptions({ collapseBursts: val })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
