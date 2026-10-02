/**
 * Zero-dependency Web Audio feedback synthesizer for FirstPass.
 *
 * Crisp mechanical shutter / paper-flick / chime blips synthesized with
 * oscillators + short noise buffers — no audio assets, no dependencies.
 * All entry points fail silently when AudioContext is blocked/unsupported.
 */

const STORAGE_KEY = 'firstpass_audio_feedback'

let sharedCtx: AudioContext | null = null

export function isAudioFeedbackEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    return raw !== 'false' && raw !== '0'
  } catch {
    return true
  }
}

export function setAudioFeedbackEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    }
  } catch {
    // Storage unavailable (private mode etc.): setting is session-only.
  }
}

function getContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!sharedCtx) {
      sharedCtx = new Ctor()
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {})
    }
    return sharedCtx
  } catch {
    return null
  }
}

/** Short filtered noise burst (mechanical click / paper flick body). */
function noiseBurst(
  ctx: AudioContext,
  at: number,
  duration: number,
  filterFreq: number,
  gain: number,
  type: BiquadFilterType = 'highpass'
): void {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * duration))
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    // Exponential decay envelope baked into the noise.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = filterFreq
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  src.connect(filter)
  filter.connect(amp)
  amp.connect(ctx.destination)
  src.start(at)
  src.stop(at + duration + 0.02)
}

/** Short sine/triangle blip with fast decay. */
function tone(
  ctx: AudioContext,
  at: number,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

function withCtx(fn: (ctx: AudioContext, now: number) => void): void {
  if (!isAudioFeedbackEnabled()) return
  const ctx = getContext()
  if (!ctx) return
  try {
    fn(ctx, ctx.currentTime)
  } catch {
    // Audio graph errors must never break the culling flow.
  }
}

/**
 * Mechanical shutter: bright click + secondary curtain slap ~35ms later.
 * Total footprint ≈ 60ms.
 */
export function playShutterSound(): void {
  withCtx((ctx, now) => {
    noiseBurst(ctx, now, 0.03, 4500, 0.5)
    tone(ctx, now, 2200, 0.02, 0.12, 'triangle')
    noiseBurst(ctx, now + 0.035, 0.025, 3200, 0.35)
  })
}

/** Paper flick: soft lowpassed swish for rejects. Total ≈ 70ms. */
export function playRejectSound(): void {
  withCtx((ctx, now) => {
    noiseBurst(ctx, now, 0.06, 900, 0.4, 'bandpass')
    tone(ctx, now + 0.01, 320, 0.05, 0.1, 'sine')
  })
}

/** Two-tone VIP chime (E5 → A5). Total ≈ 220ms. */
export function playVipChime(): void {
  withCtx((ctx, now) => {
    tone(ctx, now, 659.25, 0.12, 0.22, 'sine')
    tone(ctx, now + 0.09, 880, 0.16, 0.22, 'sine')
  })
}

/** Soft neutral UI blip for reset / face-step confirmation. Total ≈ 40ms. */
export function playResetSound(): void {
  withCtx((ctx, now) => {
    tone(ctx, now, 520, 0.035, 0.14, 'triangle')
  })
}
