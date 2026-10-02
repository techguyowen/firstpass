import React, { useEffect, useMemo, useState } from 'react'
import { X, Keyboard, ArrowRight, Eye, Layers, Zap, Columns, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  ShortcutActionDef,
  ShortcutActionId,
  ShortcutCategory,
  applyShortcutPreset,
  eventToShortcutString,
  findConflictingAction,
  formatShortcutKey,
  getActivePresetId,
  getCustomShortcuts,
  getShortcutPresets,
  resetShortcutsToDefault,
  saveCustomShortcuts,
  subscribeShortcuts
} from '../utils/shortcutsManager'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'reference' | 'customize'
}

const CATEGORY_ICONS: Record<ShortcutCategory, React.ReactNode> = {
  'Culling': <Zap size={16} className="text-emerald-400" />,
  'Navigation': <ArrowRight size={16} className="text-blue-400" />,
  'View & Zoom': <Eye size={16} className="text-amber-400" />,
  'Display & HUD': <Layers size={16} className="text-purple-400" />,
  'Compare Mode': <Columns size={16} className="text-cyan-400" />
}

function KeyBadge({ binding, onRemove }: { binding: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 min-w-[20px] bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono font-semibold text-neutral-200 shadow-sm">
      {formatShortcutKey(binding)}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove this binding"
          className="p-0.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors cursor-pointer"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, initialTab = 'reference' }) => {
  const [tab, setTab] = useState<'reference' | 'customize'>(initialTab)
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [recordingFor, setRecordingFor] = useState<ShortcutActionId | null>(null)

  // Refresh whenever shortcuts change (preset switch, record, remove, reset).
  useEffect(() => subscribeShortcuts(() => setVersion(v => v + 1)), [])

  // Reset to the requested tab each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab)
      setRecordingFor(null)
      setSearch('')
    }
  }, [isOpen, initialTab])

  // Escape closes the modal — unless we're recording (then it cancels recording).
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (recordingFor) {
          e.preventDefault()
          e.stopPropagation()
          setRecordingFor(null)
          toast('Recording cancelled', { icon: '✋' })
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, recordingFor])

  // Key capture while recording a new binding.
  useEffect(() => {
    if (!isOpen || !recordingFor) return
    const actionId = recordingFor
    const handleRecord = (e: KeyboardEvent) => {
      // Ignore lone modifier presses; keep listening for the real key.
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      // Escape handled by the closer above, but guard here too (capture order).
      if (e.key === 'Escape') {
        setRecordingFor(null)
        return
      }
      const binding = eventToShortcutString(e)
      const conflict = findConflictingAction(binding, actionId)
      if (conflict) {
        toast.error(`"${formatShortcutKey(binding)}" is already bound to "${conflict.label}"`)
        setRecordingFor(null)
        return
      }
      const map = getCustomShortcuts()
      const current = map[actionId] ?? []
      if (current.includes(binding)) {
        toast('That key is already bound to this action', { icon: 'ℹ️' })
        setRecordingFor(null)
        return
      }
      saveCustomShortcuts({ ...map, [actionId]: [...current, binding] })
      toast.success(`Bound "${formatShortcutKey(binding)}"`)
      setRecordingFor(null)
    }
    window.addEventListener('keydown', handleRecord, true)
    return () => window.removeEventListener('keydown', handleRecord, true)
  }, [isOpen, recordingFor])

  const bindings = useMemo(() => getCustomShortcuts(), [version, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const activePresetId = useMemo(() => getActivePresetId(), [version, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const presets = useMemo(() => getShortcutPresets(), [])

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SHORTCUT_ACTIONS
    return SHORTCUT_ACTIONS.filter(a => {
      if (a.label.toLowerCase().includes(q)) return true
      const keys = bindings[a.id] ?? []
      return keys.some(k => k.toLowerCase().includes(q) || formatShortcutKey(k).toLowerCase().includes(q))
    })
  }, [search, bindings])

  const actionsByCategory = useMemo(() => {
    const grouped = new Map<ShortcutCategory, ShortcutActionDef[]>()
    for (const a of filteredActions) {
      const list = grouped.get(a.category) ?? []
      list.push(a)
      grouped.set(a.category, list)
    }
    return SHORTCUT_CATEGORIES.map(cat => ({ category: cat, actions: grouped.get(cat) ?? [] })).filter(g => g.actions.length > 0)
  }, [filteredActions])

  if (!isOpen) return null

  const handleRemoveBinding = (actionId: ShortcutActionId, binding: string) => {
    const map = getCustomShortcuts()
    const current = map[actionId] ?? []
    if (current.length <= 1) {
      toast.error('An action needs at least one key — record a replacement first')
      return
    }
    saveCustomShortcuts({ ...map, [actionId]: current.filter(k => k !== binding) })
    toast.success('Binding removed')
  }

  const handleReset = () => {
    resetShortcutsToDefault()
    toast.success('Shortcuts reset to FirstPass Default')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Keyboard size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Keyboard Shortcuts</h2>
              <p className="text-xs text-neutral-400">Master high-speed photo culling with one-key actions</p>
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

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          <button
            onClick={() => { setTab('reference'); setRecordingFor(null) }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${tab === 'reference' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            Keyboard Reference
          </button>
          <button
            onClick={() => setTab('customize')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${tab === 'customize' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            Customize Keys
          </button>
        </div>

        {tab === 'reference' ? (
          <>
            {/* Reference cheatsheet */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              {SHORTCUT_CATEGORIES.map(cat => {
                const actions = SHORTCUT_ACTIONS.filter(a => a.category === cat)
                if (actions.length === 0) return null
                return (
                  <div key={cat} className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-800">
                      {CATEGORY_ICONS[cat]}
                      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">{cat}</h3>
                    </div>
                    <div className="space-y-2 text-xs">
                      {actions.map(action => (
                        <div key={action.id} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="text-neutral-400 text-[11px]">{action.label}</span>
                          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                            {(bindings[action.id] ?? action.defaultKeys).map((k) => (
                              <kbd
                                key={k}
                                className="px-1.5 py-0.5 min-w-[20px] text-center bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono font-semibold text-neutral-200 shadow-sm"
                              >
                                {formatShortcutKey(k)}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/90 flex items-center justify-between text-xs text-neutral-400 shrink-0">
              <span>Tip: Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-neutral-300 font-mono text-[10px]">?</kbd> anywhere to open or close this helper</span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Customize toolbar */}
            <div className="px-6 pt-3 pb-2 flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search actions or keys…"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <select
                value={activePresetId}
                onChange={(e) => {
                  applyShortcutPreset(e.target.value)
                  toast.success('Shortcut preset applied')
                }}
                title="Shortcut preset"
                className="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {activePresetId === 'custom' && <option value="custom">Custom</option>}
              </select>
              <button
                onClick={handleReset}
                title="Reset all shortcuts to FirstPass Default"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw size={12} /> Reset All to Default
              </button>
            </div>

            {/* Customize editor */}
            <div className="px-6 pb-4 overflow-y-auto space-y-4 flex-1">
              {actionsByCategory.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-8">No actions match "{search}".</p>
              )}
              {actionsByCategory.map(({ category, actions }) => (
                <div key={category} className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-800">
                    {CATEGORY_ICONS[category]}
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">{category}</h3>
                  </div>
                  <div className="space-y-2.5">
                    {actions.map(action => {
                      const keys = bindings[action.id] ?? action.defaultKeys
                      const isRecording = recordingFor === action.id
                      return (
                        <div key={action.id} className="flex items-center justify-between gap-3">
                          <span className="text-neutral-300 text-xs">{action.label}</span>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {keys.map((k) => (
                              <KeyBadge key={k} binding={k} onRemove={() => handleRemoveBinding(action.id, k)} />
                            ))}
                            {isRecording ? (
                              <button
                                onClick={() => setRecordingFor(null)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse cursor-pointer"
                                title="Click or press Esc to cancel"
                              >
                                Press any key or combo…
                              </button>
                            ) : (
                              <button
                                onClick={() => setRecordingFor(action.id)}
                                title="Record a new key for this action"
                                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-neutral-800 hover:bg-indigo-600 text-neutral-400 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
                              >
                                <Plus size={11} /> Record Key
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/90 flex items-center justify-between text-xs text-neutral-400 shrink-0">
              <span className="flex items-center gap-1.5">
                <Trash2 size={11} className="text-neutral-500" />
                Hover a key badge to remove it · conflicts are blocked automatically
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ShortcutsModal
