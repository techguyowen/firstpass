import { useEffect, useRef, useState } from 'react'

interface FocusPeakingOverlayProps {
  enabled: boolean
  imageSrc: string
  /** Peaking highlight color (default neon green). */
  color?: string
  /** Mirror of the main image transform so edges align under zoom/pan/rotate. */
  zoomTransform?: string
  transformOrigin?: string
  transition?: string
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(num)) return [34, 197, 94]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export default function FocusPeakingOverlay({
  enabled,
  imageSrc,
  color = '#22c55e',
  zoomTransform,
  transformOrigin,
  transition,
}: FocusPeakingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled || !imageSrc) {
      setReady(false)
      return
    }

    let isCancelled = false
    setReady(false)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageSrc

    img.onload = () => {
      if (isCancelled || !canvasRef.current) return
      try {
        const maxDim = 800
        let w = img.naturalWidth || 800
        let h = img.naturalHeight || 600
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          } else {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }

        const canvas = canvasRef.current
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.drawImage(img, 0, 0, w, h)
        const src = ctx.getImageData(0, 0, w, h)
        const lum = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) {
          lum[i] = src.data[i * 4] * 0.299 + src.data[i * 4 + 1] * 0.587 + src.data[i * 4 + 2] * 0.114
        }

        // Sobel gradient magnitude: high-frequency contrast = in-focus edges.
        const out = ctx.createImageData(w, h)
        const [cr, cg, cb] = hexToRgb(color)
        const threshold = 42
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            const gx =
              -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
              lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1]
            const gy =
              -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
              lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1]
            const mag = Math.sqrt(gx * gx + gy * gy)
            if (mag > threshold) {
              const o = i * 4
              const alpha = Math.min(235, 90 + mag * 0.9)
              out.data[o] = cr
              out.data[o + 1] = cg
              out.data[o + 2] = cb
              out.data[o + 3] = alpha
            }
          }
        }
        ctx.putImageData(out, 0, 0)
        if (!isCancelled) setReady(true)
      } catch {
        // CORS-tainted canvas or decode failure: hide the overlay gracefully.
        if (!isCancelled) setReady(false)
      }
    }

    img.onerror = () => {
      if (!isCancelled) setReady(false)
    }

    return () => {
      isCancelled = true
    }
  }, [enabled, imageSrc, color])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute z-10 max-h-full max-w-full object-contain mix-blend-screen"
      style={{
        transform: zoomTransform,
        transformOrigin,
        transition,
        opacity: ready ? 0.95 : 0,
      }}
      aria-hidden="true"
    />
  )
}
