import React, { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

export const WALKTHROUGH_STORAGE_KEY = 'firstpass_has_seen_walkthrough'

interface WalkthroughStep {
  emoji: string
  kicker: string
  title: string
  badge?: string
  highlights: string[]
  spotlight?: { label: string; body: string }
  keyAction?: string
  proTip?: string
  cta?: string
}

const STEPS: WalkthroughStep[] = [
  {
    emoji: '👋',
    kicker: 'Welcome to FirstPass',
    title: 'Pro-Grade AI Photo Culling on Your Device',
    badge: '⚡ Local AI Engine',
    highlights: [
      '100% on-device & private — your photos never leave your machine.',
      'GPU hardware acceleration (Apple Silicon MPS / CUDA) for fast inference.',
      'Zero cloud uploads, zero subscriptions phoning home.',
      'Sub-second RAW preview rendering for buttery triage.',
    ],
  },
  {
    emoji: '📁',
    kicker: '1. Import & 5-Signal AI Analysis',
    title: 'Automatic Quality & Focus Scoring',
    highlights: [
      'Reads all major camera RAWs (CR3, ARW, NEF, etc.) & JPEGs.',
      'The AI evaluates critical sharpness, histogram exposure clipping, facial expressions/blinks, aesthetic composition, and burst duplicates.',
    ],
    keyAction: 'Click "Run AI Analysis" to triage an entire shoot in 2–3 minutes.',
  },
  {
    emoji: '🎨',
    kicker: '2. Gallery & Spray Can Tool',
    title: 'High-Speed Grid & Bulk Painting',
    highlights: [
      'Filter by status, blur, faces, or scene chapters.',
      'Quota tool: Cull-to-Target auto-selects your top N best shots.',
    ],
    spotlight: {
      label: 'Spray Can (S)',
      body: 'Hold S and drag across thumbnails to paint Accept (A) or Reject (R) across dozens of frames in one fluid motion.',
    },
  },
  {
    emoji: '🔬',
    kicker: '3. Single Review & Face Loupe',
    title: '100% Focus Inspection & Face Snap',
    highlights: [
      'Click any face in the People panel to snap a 300% zoom centered right on the eyes.',
      'Press Space or Z for instant sticky zoom at cursor.',
      'Pin VIP subjects (📌) to prioritize bride/groom sharpness.',
    ],
    proTip: 'Use Cmd+Shift+L to Lock Zoom between photos.',
  },
  {
    emoji: '⚔️',
    kicker: '4. 2-Up Side-by-Side Compare',
    title: "'King of the Hill' Candidate Triage (C)",
    highlights: [
      'Compare challenger candidates side-by-side against your locked champion (L).',
      'Synchronized Zoom: zooming or panning in Viewport 1 automatically moves Viewport 2 in lockstep for instant 1:1 sharpness decisions.',
    ],
  },
  {
    emoji: '🛡️',
    kicker: '5. Survey Mode: The Safety Net',
    title: 'Rapid Rejection Review (Shift+S)',
    highlights: [
      'A fast-paced triage mode for your rejected pile.',
      'Rapidly review all AI-flagged photos full-screen to rescue creative motion-blur or candid emotional moments with A (Rescue) and R (Keep Rejected).',
    ],
  },
  {
    emoji: '📦',
    kicker: '6. Lightroom & Capture One Export',
    title: 'Seamless Sidecar & Selects Export (Cmd+E)',
    highlights: [
      'Sync 5-star ratings and color labels directly into .xmp sidecars without touching original RAW files.',
      'Or copy keepers to a Selects/ folder.',
    ],
    cta: "Let's Get Started 🚀",
  },
]

interface WalkthroughModalProps {
  isOpen: boolean
  onClose: () => void
}

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ isOpen, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0)
  const [dontShowAuto, setDontShowAuto] = useState(true)

  // Reset to the first step each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0)
      setDontShowAuto(true)
    }
  }, [isOpen])

  const persistAndClose = useCallback(
    (markSeen: boolean) => {
      try {
        if (markSeen && dontShowAuto) {
          localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1')
        } else if (!dontShowAuto) {
          localStorage.removeItem(WALKTHROUGH_STORAGE_KEY)
        } else if (markSeen) {
          localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1')
        }
      } catch {
        // localStorage unavailable — still close the modal.
      }
      onClose()
    },
    [dontShowAuto, onClose]
  )

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
  }, [])

  // Keyboard navigation: Left/Right to step, Escape to close.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        if (e.key === 'Escape') persistAndClose(false)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        persistAndClose(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, goPrev, goNext, persistAndClose])

  if (!isOpen) return null

  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => persistAndClose(true)}
    >
      <div
        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Interactive Feature Tour"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Interactive Feature Tour</h2>
              <p className="text-xs text-neutral-400">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
            </div>
          </div>
          <button
            onClick={() => persistAndClose(true)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1">
          <div className="text-5xl mb-4">{step.emoji}</div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">{step.kicker}</p>
          <h3 className="text-2xl font-bold text-white mb-4">{step.title}</h3>

          {step.badge && (
            <span className="inline-block mb-4 px-3 py-1 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
              {step.badge}
            </span>
          )}

          <ul className="space-y-2.5 mb-4">
            {step.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-300 leading-relaxed">
                <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>

          {step.spotlight && (
            <div className="mb-4 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
              <p className="text-xs font-bold text-indigo-300 mb-1">
                ⭐ Feature spotlight: {step.spotlight.label}
              </p>
              <p className="text-sm text-neutral-300 leading-relaxed">{step.spotlight.body}</p>
            </div>
          )}

          {step.keyAction && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-200 leading-relaxed">
                <span className="font-bold">👉 Key Action: </span>
                {step.keyAction}
              </p>
            </div>
          )}

          {step.proTip && (
            <div className="mb-4 p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
              <p className="text-sm text-purple-200 leading-relaxed">
                <span className="font-bold">💡 Pro Tip: </span>
                {step.proTip}
              </p>
            </div>
          )}

          {step.cta && (
            <p className="text-lg font-bold text-white mt-2">{step.cta}</p>
          )}
        </div>

        {/* Stepper dots */}
        <div className="flex items-center justify-center gap-2 px-6 pt-1 shrink-0">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStepIndex(i)}
              title={`${s.kicker}`}
              aria-label={`Go to step ${i + 1}: ${s.kicker}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                i === stepIndex
                  ? 'w-8 bg-emerald-500'
                  : 'w-2 bg-neutral-700 hover:bg-neutral-500'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex flex-col gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAuto}
              onChange={(e) => {
                const checked = e.target.checked
                setDontShowAuto(checked)
                try {
                  if (checked) {
                    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1')
                  } else {
                    localStorage.removeItem(WALKTHROUGH_STORAGE_KEY)
                  }
                } catch {
                  // ignore storage failures
                }
              }}
              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
            />
            Don&apos;t show automatically on launch
          </label>
          <div className="flex items-center justify-between">
            <button
              onClick={() => persistAndClose(true)}
              className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={isFirst}
                className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              {isLast ? (
                <button
                  onClick={() => persistAndClose(true)}
                  className="flex items-center gap-1 px-5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                >
                  Finish 🚀
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                >
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalkthroughModal
