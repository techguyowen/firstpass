import React, { useEffect, useRef, useState } from 'react'

interface ClippingOverlayProps {
  imageUrl: string
  scale: number
  origin: { x: number; y: number }
  isHoldingZoom: boolean
  enabled: boolean
  onClippingStats?: (stats: { shadowPercent: number; highlightPercent: number }) => void
}

export default function ClippingOverlay({
  imageUrl,
  scale,
  origin,
  isHoldingZoom,
  enabled,
  onClippingStats,
}: ClippingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (!enabled || !imageUrl) return

    let isCancelled = false
    setAnalyzing(true)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl

    img.onload = () => {
      if (isCancelled || !canvasRef.current) return

      // Downscale for instant high-speed analysis while preserving edge precision
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

      // Draw downscaled image into offscreen buffer
      ctx.drawImage(img, 0, 0, w, h)
      const imgData = ctx.getImageData(0, 0, w, h)
      const data = imgData.data
      const totalPixels = w * h

      let shadowClipped = 0
      let highlightClipped = 0

      // Create overlay mask:
      // - Highlights (blown > 251 in all channels or max >= 254): Vivid Red/Magenta
      // - Shadows (crushed < 5 in all channels): Vivid Electric Cyan/Blue
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        if ((r >= 252 && g >= 252 && b >= 252) || (r >= 254 && g >= 250)) {
          highlightClipped++
          data[i] = 255     // Red
          data[i + 1] = 0   // Green
          data[i + 2] = 70  // Blue
          data[i + 3] = 220 // Alpha
        } else if (r <= 5 && g <= 5 && b <= 5) {
          shadowClipped++
          data[i] = 0       // Red
          data[i + 1] = 170 // Green
          data[i + 2] = 255 // Blue
          data[i + 3] = 220 // Alpha
        } else {
          data[i + 3] = 0   // Transparent
        }
      }

      ctx.putImageData(imgData, 0, 0)
      setAnalyzing(false)

      if (onClippingStats) {
        onClippingStats({
          shadowPercent: Number(((shadowClipped / totalPixels) * 100).toFixed(1)),
          highlightPercent: Number(((highlightClipped / totalPixels) * 100).toFixed(1)),
        })
      }
    }

    img.onerror = () => {
      setAnalyzing(false)
    }

    return () => {
      isCancelled = true
    }
  }, [imageUrl, enabled])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute max-h-full max-w-full object-contain pointer-events-none z-10 animate-pulse"
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${origin.x}% ${origin.y}%`,
        transition: isHoldingZoom ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)',
        opacity: analyzing ? 0 : 0.85,
      }}
    />
  )
}
