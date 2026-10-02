import { useEffect, useState } from 'react'
import { Check, X, Undo2, Tag } from 'lucide-react'
import clsx from 'clsx'

export type RatingFlashKind = 'accepted' | 'rejected' | 'pending' | 'tagged'

interface RatingFlashHudProps {
  rating: RatingFlashKind | null
  /** Incremented on every rating so repeated identical ratings re-flash. */
  triggerKey: number
}

const FLASH_CONFIG: Record<RatingFlashKind, { label: string; ring: string; text: string; Icon: typeof Check }> = {
  accepted: { label: 'ACCEPT', ring: 'border-emerald-400/80', text: 'text-emerald-300', Icon: Check },
  rejected: { label: 'REJECT', ring: 'border-rose-400/80', text: 'text-rose-300', Icon: X },
  pending: { label: 'PENDING', ring: 'border-neutral-400/70', text: 'text-neutral-300', Icon: Undo2 },
  tagged: { label: 'TAGGED', ring: 'border-blue-400/80', text: 'text-blue-300', Icon: Tag },
}

const FLASH_DURATION_MS = 220

export default function RatingFlashHud({ rating, triggerKey }: RatingFlashHudProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!rating || triggerKey === 0) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), FLASH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [rating, triggerKey])

  if (!visible || !rating) return null
  const { label, ring, text, Icon } = FLASH_CONFIG[rating]

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-hidden="true">
      <div
        className={clsx(
          'flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-black/60 px-6 py-4 backdrop-blur-md shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-100 ease-out',
          ring
        )}
      >
        <Icon size={30} strokeWidth={3} className={text} />
        <span className={clsx('text-sm font-black tracking-[0.25em]', text)}>{label}</span>
      </div>
    </div>
  )
}
