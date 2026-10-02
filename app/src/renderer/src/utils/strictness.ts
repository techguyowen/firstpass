export interface StrictnessPreset {
  label: string
  description: string
  auto_accept: number
  min_score: number
}

export const STRICTNESS_PRESETS: StrictnessPreset[] = [
  { label: 'Very Strict', auto_accept: 85, min_score: 55, description: 'Only the sharpest, best-exposed shots' },
  { label: 'Strict', auto_accept: 78, min_score: 47, description: 'High standards, few marginal shots' },
  { label: 'Balanced', auto_accept: 70, min_score: 38, description: 'Good balance of quality and quantity' },
  { label: 'Loose', auto_accept: 62, min_score: 28, description: 'More photos pass, including borderline shots' },
  { label: 'Very Loose', auto_accept: 55, min_score: 18, description: 'Most photos kept, minimal filtering' },
]

/** Find the preset index closest to the given threshold values. */
export function closestStrictnessIndex(autoAccept: number, minScore: number): number {
  let best = 2
  let bestDist = Infinity
  STRICTNESS_PRESETS.forEach((p, i) => {
    const dist = Math.abs(p.auto_accept - autoAccept) + Math.abs(p.min_score - minScore)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}
