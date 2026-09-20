import React, { useState, useEffect } from 'react'
import { X, Check, Palette, Sparkles, Moon, Sun, Layers } from 'lucide-react'
import clsx from 'clsx'
import {
  THEME_PRESETS,
  getStoredThemeId,
  applyTheme,
  CANVAS_BACKDROP_OPTIONS,
  getStoredCanvasBackdrop,
  setStoredCanvasBackdrop,
  CanvasBackdropMode,
  ThemePreset
} from '../theme/themes'
import toast from 'react-hot-toast'

interface ThemePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onCanvasBackdropChange?: (mode: CanvasBackdropMode) => void
}

export default function ThemePickerModal({
  isOpen,
  onClose,
  onCanvasBackdropChange,
}: ThemePickerModalProps) {
  const [activeThemeId, setActiveThemeId] = useState<string>(getStoredThemeId())
  const [activeBackdrop, setActiveBackdrop] = useState<CanvasBackdropMode>(getStoredCanvasBackdrop())

  useEffect(() => {
    if (isOpen) {
      setActiveThemeId(getStoredThemeId())
      setActiveBackdrop(getStoredCanvasBackdrop())
    }
  }, [isOpen])

  // Escape key closes modal
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

  const handleSelectTheme = (preset: ThemePreset) => {
    setActiveThemeId(preset.id)
    applyTheme(preset.id)
    toast.success(`Applied ${preset.name}`, { id: 'theme-toast', icon: '🎨' })
  }

  const handleSelectBackdrop = (mode: CanvasBackdropMode) => {
    setActiveBackdrop(mode)
    setStoredCanvasBackdrop(mode)
    if (onCanvasBackdropChange) onCanvasBackdropChange(mode)
    toast.success(`Canvas backdrop set to ${mode}`, { id: 'backdrop-toast', icon: '🖼️' })
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Studio Workspace Themes</h2>
              <p className="text-xs text-neutral-400">
                Preset dark palettes crafted for photography triage and color evaluation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Theme Presets List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-2">
              <Layers size={13} className="text-blue-400" />
              <span>Color Themes</span>
            </h3>

            <div className="space-y-2.5">
              {THEME_PRESETS.map((preset) => {
                const isSelected = activeThemeId === preset.id
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectTheme(preset)}
                    className={clsx(
                      'w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer group',
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/30 bg-neutral-950 shadow-lg'
                        : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 hover:bg-neutral-950/80'
                    )}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* 4-Color Swatch Preview */}
                      <div className="flex items-center rounded-lg overflow-hidden border border-neutral-700/80 shadow-sm shrink-0 w-16 h-8">
                        {preset.colors.swatchPreview.map((color, i) => (
                          <div
                            key={i}
                            style={{ backgroundColor: color }}
                            className="flex-1 h-full"
                          />
                        ))}
                      </div>

                      <div className="min-w-0 truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">
                            {preset.name}
                          </span>
                          {preset.id === 'neutral' && (
                            <span className="text-[10px] bg-sky-500/20 text-sky-300 font-mono px-1.5 py-0.2 rounded border border-sky-500/30">
                              Pro Standard
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 truncate">
                          {preset.tagline}
                        </p>
                      </div>
                    </div>

                    {/* Selection Indicator */}
                    <div className="shrink-0 ml-3">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-neutral-700 group-hover:border-neutral-500 transition-colors" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Photo Canvas Backdrop Brightness */}
          <div className="pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Moon size={13} className="text-purple-400" />
                <span>Review Canvas Backdrop (Behind Photo)</span>
              </h3>
              <span className="text-[11px] text-neutral-500">
                Studio Industry Standard
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {CANVAS_BACKDROP_OPTIONS.map((opt) => {
                const isSelected = activeBackdrop === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectBackdrop(opt.id)}
                    className={clsx(
                      'flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all cursor-pointer group',
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/30 bg-neutral-950'
                        : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
                    )}
                  >
                    <div
                      style={{ backgroundColor: opt.color }}
                      className="w-10 h-10 rounded-lg border border-neutral-700/80 shadow-inner flex items-center justify-center"
                    >
                      {isSelected && <Check size={14} className="text-white drop-shadow" />}
                    </div>
                    <span className="text-[11px] font-medium text-neutral-200 leading-tight text-center">
                      {opt.label === '18% Neutral Gray' ? '18% Neutral' : opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>Tip: In Review mode, press <strong className="text-neutral-300">L</strong> for Lights Out dimming.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
