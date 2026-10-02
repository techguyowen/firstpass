// Shared face-zoom geometry for Gallery (QuickLoupeModal), Review and Compare.
//
// Face boxes arrive as absolute pixels `[x, y, w, h]` in the coordinate space
// of the image the detector ran on. That space can differ from
// `photo.width`/`photo.height` (e.g. RAW half-size demosaic, or a downscaled
// detection array), so callers must forward the detection dimensions when the
// backend provides them (`det_width`/`det_height` on each face record).
//
// Displayed-vs-detection orientation: detection runs on the stored (unrotated)
// pixel buffer while browsers paint EXIF-rotated content, and Compare/Review
// add their own CSS rotation on top. `rotateFaceCenter` maps a normalized
// face center into the displayed frame for 0/90/180/270° clockwise steps:
//   0°:   (nx, ny)
//   90°:  (1 - ny, nx)
//   180°: (1 - nx, 1 - ny)
//   270°: (ny, 1 - nx)

export type FaceBox = [number, number, number, number]

export interface FaceDetectionDims {
  detWidth?: number | null
  detHeight?: number | null
}

export interface FaceZoomOptions extends FaceDetectionDims {
  /** Clockwise display rotation relative to detection coordinates. Snapped to 90°. */
  rotationDeg?: number
}

/** Extra payload a FaceLoupe selection can carry (4th `onSelectFace` arg). */
export interface FaceSelectionMeta extends FaceDetectionDims {}

/** Shared `onSelectFace` signature so detection dims survive ScorePanel forwarding. */
export type FaceSelectHandler = (
  box: FaceBox,
  faceIndex?: number,
  isVip?: boolean,
  meta?: FaceSelectionMeta
) => void

export type QuarterTurn = 0 | 90 | 180 | 270

const isPositive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

/** Snap any degree value to the nearest quarter turn (0/90/180/270). */
export function snapRotationToStep(rotationDeg: number): QuarterTurn {
  if (!Number.isFinite(rotationDeg)) return 0
  const steps: QuarterTurn[] = [0, 90, 180, 270]
  const normalized = ((Math.round(rotationDeg / 90) % 4) + 4) % 4
  return steps[normalized] as QuarterTurn
}

/**
 * Face-box center as 0..1 fractions of the reference frame.
 * Uses detection dims when they are positive, else the photo dims.
 * Also accepts already-normalized boxes (all values within 0..1).
 */
export function normalizeFaceCenter(
  box: FaceBox,
  refWidth: number,
  refHeight: number,
  dims?: FaceDetectionDims
): { nx: number; ny: number } {
  const [bx, by, bw, bh] = box
  const detW = dims?.detWidth
  const detH = dims?.detHeight
  const w = isPositive(detW) ? detW : refWidth
  const h = isPositive(detH) ? detH : refHeight
  if (!(w > 0) || !(h > 0)) return { nx: 0.5, ny: 0.5 }

  const looksNormalized =
    refWidth > 2 &&
    refHeight > 2 &&
    [bx, by, bw, bh].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
  const cx = looksNormalized ? bx + bw / 2 : (bx + bw / 2) / w
  const cy = looksNormalized ? by + bh / 2 : (by + bh / 2) / h
  return {
    nx: Math.max(0, Math.min(1, cx)),
    ny: Math.max(0, Math.min(1, cy)),
  }
}

/** Map a 0..1 face center into the displayed frame for a clockwise rotation. */
export function rotateFaceCenter(
  nx: number,
  ny: number,
  rotationDeg: number
): { nx: number; ny: number } {
  const step = snapRotationToStep(rotationDeg)
  let rx = nx
  let ry = ny
  if (step === 90) {
    rx = 1 - ny
    ry = nx
  } else if (step === 180) {
    rx = 1 - nx
    ry = 1 - ny
  } else if (step === 270) {
    rx = ny
    ry = 1 - nx
  }
  return {
    nx: Math.max(0, Math.min(1, rx)),
    ny: Math.max(0, Math.min(1, ry)),
  }
}

/** Normalized, rotation-mapped face center as 0..1 fractions. */
export function faceContentFractions(
  box: FaceBox,
  photoWidth: number,
  photoHeight: number,
  opts?: FaceZoomOptions
): { nx: number; ny: number } {
  const base = normalizeFaceCenter(box, photoWidth, photoHeight, opts)
  return rotateFaceCenter(base.nx, base.ny, opts?.rotationDeg ?? 0)
}

/**
 * Face-box center as `transform-origin` percentages (clamped to 5..95 so the
 * zoom anchor never sticks to the extreme edge).
 */
export function faceBoxToZoomOriginPercent(
  box: FaceBox,
  photoWidth: number,
  photoHeight: number,
  opts?: FaceZoomOptions
): { x: number; y: number } {
  const { nx, ny } = faceContentFractions(box, photoWidth, photoHeight, opts)
  return {
    x: Math.max(5, Math.min(95, nx * 100)),
    y: Math.max(5, Math.min(95, ny * 100)),
  }
}

/**
 * Convert a 0..1 content fraction into percentages of an `object-contain`
 * element box, compensating for letterbox/pillarbox padding.
 *
 * `contentW`/`contentH` describe the displayed image aspect (photo dims,
 * swapped for 90/270° display rotation). When the element aspect does not
 * match the content aspect within tolerance the element is not a letterboxed
 * view of this content (e.g. EXIF-swapped render), so the fraction passes
 * through unchanged instead of applying a bogus shift.
 */
export function contentFractionToElementPercent(
  fx: number,
  fy: number,
  elW: number,
  elH: number,
  contentW: number,
  contentH: number
): { x: number; y: number } {
  const direct = {
    x: Math.max(5, Math.min(95, fx * 100)),
    y: Math.max(5, Math.min(95, fy * 100)),
  }
  if (!(elW > 0) || !(elH > 0) || !(contentW > 0) || !(contentH > 0)) return direct
  const elAspect = elW / elH
  const contentAspect = contentW / contentH

  let ox: number
  let oy: number
  if (elAspect > contentAspect) {
    // Pillarbox: content fills element height.
    const cw = elH * contentAspect
    const padX = (elW - cw) / 2
    ox = ((padX + fx * cw) / elW) * 100
    oy = fy * 100
  } else {
    // Letterbox: content fills element width.
    const ch = elW / contentAspect
    const padY = (elH - ch) / 2
    ox = fx * 100
    oy = ((padY + fy * ch) / elH) * 100
  }
  return {
    x: Math.max(5, Math.min(95, ox)),
    y: Math.max(5, Math.min(95, oy)),
  }
}

/**
 * Face-box center as `transform-origin` percentages for a measured
 * `object-contain` element. Falls back to the unmeasured mapping when no
 * element size is available.
 */
export function faceBoxToZoomOriginForElement(
  box: FaceBox,
  photoWidth: number,
  photoHeight: number,
  elW: number | null | undefined,
  elH: number | null | undefined,
  opts?: FaceZoomOptions
): { x: number; y: number } {
  const { nx, ny } = faceContentFractions(box, photoWidth, photoHeight, opts)
  if (!(elW != null && elH != null && elW > 0 && elH > 0)) {
    return {
      x: Math.max(5, Math.min(95, nx * 100)),
      y: Math.max(5, Math.min(95, ny * 100)),
    }
  }
  const step = snapRotationToStep(opts?.rotationDeg ?? 0)
  const swapped = step === 90 || step === 270
  return contentFractionToElementPercent(
    nx,
    ny,
    elW,
    elH,
    swapped ? photoHeight : photoWidth,
    swapped ? photoWidth : photoHeight
  )
}
