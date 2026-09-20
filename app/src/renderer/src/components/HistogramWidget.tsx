import React, { useEffect, useRef, useState } from 'react'
import { Activity, Sliders, Anchor } from 'lucide-react'
import clsx from 'clsx'
import DraggablePanel from './DraggablePanel'

export type ChannelMode = 'rgb' | 'luma' | 'r' | 'g' | 'b'

export interface HistogramData {
  r: number[]
  g: number[]
  b: number[]
  luma: number[]
  maxBin: number
  shadowClip: number
  highlightClip: number
  meanLuma: number
}

interface HistogramChartProps {
  imageUrl: string
  compact?: boolean
  className?: string
  headerRight?: React.ReactNode
}

export function HistogramChart({ imageUrl, compact = false, className, headerRight }: HistogramChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [channelMode, setChannelMode] = useState<ChannelMode>('rgb')
  const [data, setData] = useState<HistogramData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!imageUrl) return

    let cancelled = false
    setLoading(true)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl

    img.onload = () => {
      if (cancelled) return

      // Sample a 200x200 downscale for instant, smooth histogram bins
      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = 200
      sampleCanvas.height = 200
      const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      ctx.drawImage(img, 0, 0, 200, 200)
      const imgData = ctx.getImageData(0, 0, 200, 200)
      const pixels = imgData.data
      const totalPixels = 200 * 200

      const rBins = new Array(256).fill(0)
      const gBins = new Array(256).fill(0)
      const bBins = new Array(256).fill(0)
      const lumaBins = new Array(256).fill(0)

      let totalLuma = 0
      let shadowCount = 0
      let highlightCount = 0

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        // Standard Rec. 709 luminance weights
        const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)

        rBins[r]++
        gBins[g]++
        bBins[b]++
        lumaBins[y]++

        totalLuma += y
        if (y <= 5) shadowCount++
        if (y >= 250) highlightCount++
      }

      // Smooth peak ignoring outliers to give a readable, balanced graph
      let maxBin = 0
      for (let i = 2; i < 254; i++) {
        if (rBins[i] > maxBin) maxBin = rBins[i]
        if (gBins[i] > maxBin) maxBin = gBins[i]
        if (bBins[i] > maxBin) maxBin = bBins[i]
        if (lumaBins[i] > maxBin) maxBin = lumaBins[i]
      }
      if (maxBin === 0) maxBin = 1

      setData({
        r: rBins,
        g: gBins,
        b: bBins,
        luma: lumaBins,
        maxBin,
        shadowClip: parseFloat(((shadowCount / totalPixels) * 100).toFixed(1)),
        highlightClip: parseFloat(((highlightCount / totalPixels) * 100).toFixed(1)),
        meanLuma: Math.round(totalLuma / totalPixels)
      })
      setLoading(false)
    }

    img.onerror = () => {
      if (!cancelled) setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Draw histogram canvas whenever data or channelMode changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    // Subtle dark grid background
    ctx.fillStyle = '#121214'
    ctx.fillRect(0, 0, width, height)

    // Vertical quarter-stops
    ctx.strokeStyle = '#27272a'
    ctx.lineWidth = 1
    for (let i = 1; i <= 3; i++) {
      const x = Math.round((width / 4) * i)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    const drawChannel = (bins: number[], fillColor: string, strokeColor: string) => {
      ctx.fillStyle = fillColor
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(0, height)

      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width
        // Nonlinear scaling so shadows/highlights are readable
        const normalized = Math.min(1, bins[i] / data.maxBin)
        const y = height - Math.sqrt(normalized) * (height - 4) - 2
        ctx.lineTo(x, y)
      }

      ctx.lineTo(width, height)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    if (channelMode === 'rgb') {
      ctx.globalCompositeOperation = 'screen'
      drawChannel(data.r, 'rgba(239, 68, 68, 0.45)', 'rgba(239, 68, 68, 0.9)')
      drawChannel(data.g, 'rgba(34, 197, 94, 0.45)', 'rgba(34, 197, 94, 0.9)')
      drawChannel(data.b, 'rgba(59, 130, 246, 0.45)', 'rgba(59, 130, 246, 0.9)')
      ctx.globalCompositeOperation = 'source-over'
    } else if (channelMode === 'luma') {
      drawChannel(data.luma, 'rgba(244, 244, 245, 0.35)', 'rgba(255, 255, 255, 0.9)')
    } else if (channelMode === 'r') {
      drawChannel(data.r, 'rgba(239, 68, 68, 0.5)', 'rgba(239, 68, 68, 1)')
    } else if (channelMode === 'g') {
      drawChannel(data.g, 'rgba(34, 197, 94, 0.5)', 'rgba(34, 197, 94, 1)')
    } else if (channelMode === 'b') {
      drawChannel(data.b, 'rgba(59, 130, 246, 0.5)', 'rgba(59, 130, 246, 1)')
    }
  }, [data, channelMode])

  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {/* Channel Switcher + Optional Header Right Controls */}
      <div className="flex items-center justify-between">
        <div className="flex bg-neutral-950 rounded p-0.5 border border-neutral-800 text-[10px] font-semibold">
          {(['rgb', 'luma', 'r', 'g', 'b'] as ChannelMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setChannelMode(mode)}
              className={clsx(
                'px-1.5 py-0.5 rounded cursor-pointer uppercase transition-colors',
                channelMode === mode
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        {headerRight}
      </div>

      {/* Graph Area */}
      <div className={clsx(
        "relative w-full bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center",
        compact ? "h-20" : "h-24"
      )}>
        {loading && !data && (
          <div className="text-neutral-500 text-xs font-mono">Computing bins...</div>
        )}
        <canvas
          ref={canvasRef}
          width={256}
          height={compact ? 80 : 96}
          className="w-full h-full block"
        />

        {/* Shadow / Highlight Clipping alerts on the graph edges */}
        {data && data.shadowClip > 0 && (
          <div
            className="absolute bottom-1 left-1.5 px-1 py-0.2 rounded bg-blue-950/80 border border-blue-500/60 text-blue-300 text-[9px] font-mono font-bold"
            title={`Shadow clipping: ${data.shadowClip}% of pixels crushed to pure black`}
          >
            🌑 {data.shadowClip}%
          </div>
        )}
        {data && data.highlightClip > 0 && (
          <div
            className="absolute bottom-1 right-1.5 px-1 py-0.2 rounded bg-red-950/80 border border-red-500/60 text-red-300 text-[9px] font-mono font-bold"
            title={`Highlight clipping: ${data.highlightClip}% of pixels blown to pure white`}
          >
            ☀️ {data.highlightClip}%
          </div>
        )}
      </div>

      {/* Footer statistics */}
      {data && (
        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono px-0.5">
          <span>Mean: <strong className="text-neutral-200">{data.meanLuma}</strong>/255</span>
          <span>Shadows: <strong className={data.shadowClip > 1 ? 'text-blue-400' : 'text-neutral-400'}>{data.shadowClip}%</strong></span>
          <span>Highlights: <strong className={data.highlightClip > 1 ? 'text-rose-400' : 'text-neutral-400'}>{data.highlightClip}%</strong></span>
        </div>
      )}
    </div>
  )
}

export interface HistogramWidgetProps {
  imageUrl: string
  isOpen: boolean
  onClose: () => void
  onDockToSidebar?: () => void
  onDockToBottom?: () => void
}

export default function HistogramWidget({ imageUrl, isOpen, onClose, onDockToSidebar, onDockToBottom }: HistogramWidgetProps) {
  if (!isOpen) return null

  return (
    <DraggablePanel
      title="Histogram"
      icon={<Activity size={13} className="text-purple-400" />}
      storageKey="photo_culler_histogram_pos"
      defaultPosition={{ x: 80, y: 70 }}
      width={310}
      isOpen={isOpen}
      onClose={onClose}
      supportedDockZones={['sidebar', 'bottom']}
      onSnapDock={(zone) => {
        if (zone === 'sidebar' && onDockToSidebar) {
          onDockToSidebar()
        } else if (zone === 'bottom' && onDockToBottom) {
          onDockToBottom()
        }
      }}
      headerControls={
        <div className="flex items-center gap-1 mr-1">
          {onDockToBottom && (
            <button
              type="button"
              onClick={onDockToBottom}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Dock Histogram to Bottom Stage Bar"
            >
              <Anchor size={11} />
            </button>
          )}
          {onDockToSidebar && (
            <button
              type="button"
              onClick={onDockToSidebar}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Dock Histogram into Inspector Sidebar"
            >
              <Sliders size={11} />
            </button>
          )}
        </div>
      }
    >
      <HistogramChart imageUrl={imageUrl} />
    </DraggablePanel>
  )
}
