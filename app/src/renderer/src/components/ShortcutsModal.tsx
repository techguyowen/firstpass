import React, { useEffect } from 'react'
import { X, Keyboard, ArrowRight, Eye, Columns, Grid, Undo2, Zap, Layers } from 'lucide-react'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  label: string
}

interface ShortcutSection {
  title: string
  icon: React.ReactNode
  shortcuts: ShortcutItem[]
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sections: ShortcutSection[] = [
    {
      title: 'Culling Actions',
      icon: <Zap size={16} className="text-emerald-400" />,
      shortcuts: [
        { keys: ['A'], label: 'Accept (keep photo)' },
        { keys: ['R'], label: 'Reject photo' },
        { keys: ['Space'], label: 'Skip / Toggle' },
        { keys: ['Z', '⌘ / Ctrl', 'Z'], label: 'Undo' },
        { keys: ['⌘ / Ctrl', '⇧', 'Z'], label: 'Redo' }
      ]
    },
    {
      title: 'Navigation',
      icon: <ArrowRight size={16} className="text-blue-400" />,
      shortcuts: [
        { keys: ['←', '→'], label: 'Previous / Next photo' },
        { keys: ['Home', 'End'], label: 'First / Last photo' },
        { keys: ['F'], label: 'Fullscreen' }
      ]
    },
    {
      title: 'Views & Panels',
      icon: <Layers size={16} className="text-amber-400" />,
      shortcuts: [
        { keys: ['1', '2', '3', '4', '5'], label: 'Star ratings' },
        { keys: ['P'], label: 'Pin VIP face' },
        { keys: ['Tab'], label: 'Toggle Inspector panel' },
        { keys: ['H'], label: 'Histogram mode' },
        { keys: ['?'], label: 'Show this help dialog' }
      ]
    },
    {
      title: 'Gallery Grid',
      icon: <Grid size={16} className="text-blue-400" />,
      shortcuts: [
        { keys: ['←', '→', '↑', '↓'], label: 'Navigate photo grid' },
        { keys: ['Space'], label: 'Quick Loupe (Full-res popup)' },
        { keys: ['Enter'], label: 'Open in Single Photo Review' },
        { keys: ['C'], label: 'Instant 2-Up Compare selected/adjacent' },
        { keys: ['\\', 'T'], label: 'Tag / Untag photo' },
        { keys: ['Caps Lock'], label: 'Toggle Auto-Advance' },
        { keys: ['` / ~', '1', 'A', 'P'], label: 'Keep / Accept & next' },
        { keys: ['2', 'R', 'X'], label: 'Reject & next' },
        { keys: ['0', 'U'], label: 'Reset to Pending' },
        { keys: ['⌘ / Ctrl', 'Z'], label: 'Undo status change' },
        { keys: ['⌘ / Ctrl', '⇧', 'Z'], label: 'Redo status change' }
      ]
    },
    {
      title: 'Side-by-Side Compare',
      icon: <Columns size={16} className="text-purple-400" />,
      shortcuts: [
        { keys: ['←', '→'], label: 'Cycle Candidate photos' },
        { keys: ['S'], label: 'Swap Ref & Candidate / Promote to Ref' },
        { keys: ['Shift', 'Click'], label: 'Set clicked photo as Reference (#1)' },
        { keys: ['1'], label: 'Keep Reference photo (Left)' },
        { keys: ['2'], label: 'Keep Candidate photo (Right)' },
        { keys: ['X'], label: 'Reject Candidate & advance' },
        { keys: ['L'], label: 'Toggle Reference Lock' },
        { keys: ['Z', 'F'], label: 'Toggle 250% Synchronized Zoom & Pan' },
        { keys: ['Esc'], label: 'Return to Review or Gallery' }
      ]
    },
    {
      title: 'Single Photo Review',
      icon: <Eye size={16} className="text-emerald-400" />,
      shortcuts: [
        { keys: ['Click & Hold'], label: 'Instant 100% Zoom (Release to fit)' },
        { keys: ['L'], label: 'Lights Out Mode (Dim / Blackout)' },
        { keys: ['I'], label: 'Photo Info HUD (Triage / EXIF / Off)' },
        { keys: ['E'], label: 'Toggle Exposure Clipping ("Blinkies")' },
        { keys: ['H'], label: 'Toggle RGB/Luma Histogram widget' },
        { keys: ['Tab'], label: 'Toggle / Dock Inspector Sidebar' },
        { keys: ['C'], label: 'Instant 2-Up Compare with adjacent' },
        { keys: ['\\', 'T'], label: 'Tag / Untag photo' },
        { keys: ['Caps Lock'], label: 'Toggle Auto-Advance' },
        { keys: ['B'], label: 'Toggle Filmstrip (Bottom / Side / Off)' },
        { keys: ['` / ~', 'A', '1', 'P'], label: 'Accept & advance' },
        { keys: ['R', '2', 'X'], label: 'Reject & advance' },
        { keys: ['Space'], label: 'Skip (Keep pending & next)' },
        { keys: ['Z'], label: 'Toggle 250% Zoom to cursor' },
        { keys: ['[', ']'], label: 'Cycle detected faces in Face Loupe' },
        { keys: ['←', '→'], label: 'Previous / Next photo' },
        { keys: ['F'], label: 'Toggle Fullscreen view' },
        { keys: ['Esc'], label: 'Reset Lights / Back to Gallery' }
      ]
    },
    {
      title: 'Menu Bar & Global',
      icon: <Keyboard size={16} className="text-amber-400" />,
      shortcuts: [
        { keys: ['⌘ / Ctrl', 'O'], label: 'Open / Import Folder' },
        { keys: ['⌘ / Ctrl', 'E'], label: 'Export Culled Photos' },
        { keys: ['⌘ / Ctrl', '1'], label: 'Switch to Gallery Grid' },
        { keys: ['⌘ / Ctrl', '2'], label: 'Switch to Single Photo Review' },
        { keys: ['⌘ / Ctrl', '3'], label: 'Switch to 2-Up Compare' },
        { keys: ['⌘ / Ctrl', ','], label: 'Preferences / Settings' },
        { keys: ['⌘ / Ctrl', 'Z'], label: 'Undo Rating' },
        { keys: ['⌘ / Ctrl', 'Shift', 'Z'], label: 'Redo Rating' },
        { keys: ['?'], label: 'Toggle this Shortcuts Guide' },
        { keys: ['Esc'], label: 'Dismiss / Close / Back' }
      ]
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map((section) => (
            <div key={section.title} className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-800">
                {section.icon}
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-200">{section.title}</h3>
              </div>
              <div className="space-y-2 text-xs">
                {section.shortcuts.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-neutral-400 text-[11px]">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-1.5 py-0.5 min-w-[20px] text-center bg-neutral-800 border border-neutral-700 rounded text-[10px] font-mono font-semibold text-neutral-200 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
      </div>
    </div>
  )
}

export default ShortcutsModal
