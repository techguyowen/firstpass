export type CompositionGridMode = 'thirds' | 'golden' | 'crosshair' | 'none'

interface CompositionGridOverlayProps {
  mode: CompositionGridMode
  /** Source image aspect ratio (w/h). Reserved for letterboxed framing; overlay currently fills its container. */
  aspectRatio?: number
}

const LINE_PROPS = {
  stroke: 'rgba(255,255,255,0.55)',
  strokeWidth: 1,
} as const

function ThirdsGrid() {
  const thirds = [1 / 3, 2 / 3]
  return (
    <g>
      {thirds.map((t) => (
        <line key={`v${t}`} x1={t} y1={0} x2={t} y2={1} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      ))}
      {thirds.map((t) => (
        <line key={`h${t}`} x1={0} y1={t} x2={1} y2={t} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      ))}
      {thirds.map((x) =>
        thirds.map((y) => (
          <circle
            key={`p${x}-${y}`}
            cx={x}
            cy={y}
            r={5}
            fill="none"
            stroke="rgba(251,191,36,0.85)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}
    </g>
  )
}

function GoldenGrid() {
  const phi = 0.618
  const phiInv = 0.382
  const cuts = [phiInv, phi]
  return (
    <g>
      {cuts.map((t) => (
        <line key={`v${t}`} x1={t} y1={0} x2={t} y2={1} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      ))}
      {cuts.map((t) => (
        <line key={`h${t}`} x1={0} y1={t} x2={1} y2={t} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      ))}
      {cuts.map((x) =>
        cuts.map((y) => (
          <circle
            key={`p${x}-${y}`}
            cx={x}
            cy={y}
            r={5}
            fill="none"
            stroke="rgba(251,191,36,0.85)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}
    </g>
  )
}

function Crosshair() {
  return (
    <g>
      <line x1={0.5} y1={0} x2={0.5} y2={1} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      <line x1={0} y1={0.5} x2={1} y2={0.5} {...LINE_PROPS} vectorEffect="non-scaling-stroke" />
      <circle cx={0.5} cy={0.5} r={28} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={0.5} cy={0.5} r={3} fill="rgba(251,191,36,0.9)" />
    </g>
  )
}

export default function CompositionGridOverlay({ mode }: CompositionGridOverlayProps) {
  if (mode === 'none') return null
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}
      aria-hidden="true"
    >
      {mode === 'thirds' && <ThirdsGrid />}
      {mode === 'golden' && <GoldenGrid />}
      {mode === 'crosshair' && <Crosshair />}
    </svg>
  )
}
