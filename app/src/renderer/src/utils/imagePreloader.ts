/**
 * High-performance Image Preloader, GPU Decode Engine & Predictive Lookahead RAM Cache
 * Pre-fetches and asynchronously decodes image bitmaps into Chromium GPU memory
 * ensuring instant 0ms transitions during rapid photo culling.
 *
 * Predictive lookahead: tracks the active navigation direction (+1 forward /
 * -1 backward) and primes the next 5-10 frames in that direction as blob URLs
 * in RAM, keeping 2-3 trailing frames for instant reversals. When the user
 * flips direction, priorities pivot immediately to the new direction.
 */

import { api } from '../api/client'

// Cache of URLs that have finished downloading and GPU decoding
const decodedUrls = new Set<string>()

// Active in-flight decode promises to avoid duplicate network requests
const inFlightDecodes = new Map<string, Promise<boolean>>()

// Maximum number of pre-decoded Image DOM objects held in memory to keep GPU raster textures hot
const MAX_HELD_IMAGES = 40
const heldImages: HTMLImageElement[] = []

/**
 * Preload and decode a single image URL into memory asynchronously.
 */
export async function preloadAndDecodeImage(url: string): Promise<boolean> {
  if (!url) return false
  if (decodedUrls.has(url)) return true

  if (inFlightDecodes.has(url)) {
    return inFlightDecodes.get(url)!
  }

  const promise = (async () => {
    try {
      const img: HTMLImageElement = new Image()
      img.decoding = 'async'
      img.src = url

      if (typeof (img as any).decode === 'function') {
        await img.decode()
      } else {
        await new Promise((resolve, reject) => {
          ;(img as any).onload = () => resolve(true)
          ;(img as any).onerror = reject
        })
      }

      decodedUrls.add(url)

      // Hold a reference so Chromium doesn't immediately garbage-collect the decoded GPU texture
      heldImages.push(img)
      if (heldImages.length > MAX_HELD_IMAGES) {
        heldImages.shift()
      }

      return true
    } catch {
      // Decode failed or cancelled (e.g. network abort)
      return false
    } finally {
      inFlightDecodes.delete(url)
    }
  })()

  inFlightDecodes.set(url, promise)
  return promise
}

/**
 * Check synchronously if an image URL has already been decoded and is ready for instant 0ms blitting.
 */
export function isImageDecoded(url: string): boolean {
  if (!url) return false
  return decodedUrls.has(url)
}

/**
 * Preload a forward and backward window of photos around the current index.
 * Prioritizes immediate neighbors first (+1, -1, +2, +3, -2, +4, +5).
 */
export function preloadAdjacentPhotos(
  photos: { id: number }[],
  currentIndex: number,
  getFullUrl: (id: number) => string,
  getThumbUrl: (id: number) => string,
  aheadCount = 6,
  behindCount = 2
): void {
  if (!photos || photos.length === 0 || currentIndex < 0) return

  if (photos[currentIndex]) {
    preloadAndDecodeImage(getFullUrl(photos[currentIndex].id))
  }

  const offsets: number[] = []
  const maxRange = Math.max(aheadCount, behindCount)

  for (let i = 1; i <= maxRange; i++) {
    if (i <= aheadCount) offsets.push(i)
    if (i <= behindCount) offsets.push(-i)
  }

  for (const offset of offsets) {
    const idx = currentIndex + offset
    if (idx >= 0 && idx < photos.length) {
      const p = photos[idx]
      // Preload full image
      preloadAndDecodeImage(getFullUrl(p.id))
      // Preload thumbnail
      preloadAndDecodeImage(getThumbUrl(p.id))
    }
  }
}

// ── Predictive Lookahead RAM Blob / Bitmap Cache ────────────────────────────

// Active navigation direction: +1 forward, -1 backward. Defaults to forward.
let activeDirection: 1 | -1 = 1

export function setNavigationDirection(direction: 1 | -1): void {
  activeDirection = direction
}

export function getNavigationDirection(): 1 | -1 {
  return activeDirection
}

export interface RamCacheEntry {
  blobUrl: string
  fullUrl: string
  size: number
}

// Primed frames held in RAM as blob URLs for 0ms rendering
export const lookaheadRamCache = new Map<number, RamCacheEntry>()

// Keep 25-30 frames in RAM; evict oldest-first beyond the cap
export const MAX_RAM_CACHE_FRAMES = 28

// In-flight per-photo RAM primes to avoid duplicate fetches
const inFlightRamFetches = new Map<number, Promise<string | null>>()

// Monotonic run id: bumped on every trigger so a direction flip immediately
// abandons the stale queue and pivots priorities to the new direction
let lookaheadRunId = 0

export function getRamCachedImageUrl(photoId: number): string | null {
  return lookaheadRamCache.get(photoId)?.blobUrl ?? null
}

export function isPhotoInRam(photoId: number): boolean {
  return lookaheadRamCache.has(photoId)
}

export function clearLookaheadRamCache(): void {
  lookaheadRunId++
  inFlightRamFetches.clear()
  for (const item of lookaheadRamCache.values()) {
    try {
      URL.revokeObjectURL(item.blobUrl)
    } catch {
      // ignore revoke failures
    }
  }
  lookaheadRamCache.clear()
}

function storeInRamCache(photoId: number, blobUrl: string, fullUrl: string, size: number): void {
  const existing = lookaheadRamCache.get(photoId)
  if (existing) {
    if (existing.blobUrl !== blobUrl) {
      try {
        URL.revokeObjectURL(existing.blobUrl)
      } catch {
        // ignore revoke failures
      }
    }
    // Refresh LRU order
    lookaheadRamCache.delete(photoId)
  }
  lookaheadRamCache.set(photoId, { blobUrl, fullUrl, size })

  // LRU eviction: drop oldest-first to prevent memory leaks
  while (lookaheadRamCache.size > MAX_RAM_CACHE_FRAMES) {
    const oldest = lookaheadRamCache.keys().next()
    if (oldest.done) break
    const item = lookaheadRamCache.get(oldest.value)
    if (item) {
      try {
        URL.revokeObjectURL(item.blobUrl)
      } catch {
        // ignore revoke failures
      }
    }
    lookaheadRamCache.delete(oldest.value)
  }
}

function getLookaheadAuthHeaders(): Record<string, string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const token =
        localStorage.getItem('firstpass_api_token') ||
        localStorage.getItem('photo_culler_api_token')
      if (token) return { Authorization: `Bearer ${token}` }
    }
  } catch {
    // storage unavailable — fall through to unauthenticated fetch
  }
  return {}
}

/**
 * Fetch one frame into the RAM blob cache and warm the Chromium GPU raster
 * cache via img.decode(). Returns the blob URL, or null on failure / stale run.
 */
async function primePhotoIntoRam(
  photoId: number,
  fullUrl: string,
  runId: number
): Promise<string | null> {
  const hit = lookaheadRamCache.get(photoId)
  if (hit) {
    // Refresh LRU order on reuse
    lookaheadRamCache.delete(photoId)
    lookaheadRamCache.set(photoId, hit)
    return hit.blobUrl
  }

  const inFlight = inFlightRamFetches.get(photoId)
  if (inFlight) return inFlight

  const promise = (async () => {
    try {
      const res = await fetch(fullUrl, { headers: getLookaheadAuthHeaders() })
      if (!res.ok) return null
      const blob = await res.blob()
      // Abandoned by a newer trigger (direction flip): drop without caching
      if (runId !== lookaheadRunId) return null
      const blobUrl = URL.createObjectURL(blob)

      // Warm the Chromium GPU raster cache
      try {
        const img: HTMLImageElement = new Image()
        img.decoding = 'async'
        img.src = blobUrl
        if (typeof (img as any).decode === 'function') {
          await img.decode()
        }
        heldImages.push(img)
        if (heldImages.length > MAX_HELD_IMAGES) {
          heldImages.shift()
        }
      } catch {
        // GPU warm failed — the blob URL is still instantly renderable
      }

      storeInRamCache(photoId, blobUrl, fullUrl, blob.size)
      return blobUrl
    } catch {
      return null
    } finally {
      inFlightRamFetches.delete(photoId)
    }
  })()

  inFlightRamFetches.set(photoId, promise)
  return promise
}

/**
 * Priority offsets for the predictive window, ordered nearest-first:
 * forward: +1 (high), +2..+5 (medium), +6..+10 (extended), -1,-2 (trailing).
 * Mirrored when navigating backward.
 */
export function getLookaheadOffsets(direction: 1 | -1): number[] {
  const forward = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -1, -2]
  return direction === 1 ? forward : forward.map((o) => -o)
}

export interface PredictiveLookaheadOptions {
  /** Concurrent fetches (default 3) so we don't choke the socket */
  concurrency?: number
  /** Override backend pre-warm call (defaults to api.preloadLookahead) */
  preloadLookahead?: (photoIds: number[]) => void
  /** Also warm thumbnails via the GPU decode path (default true) */
  warmThumbnails?: boolean
}

/**
 * Predictively pre-fetch and cache the next frames in the active navigation
 * direction. Sequential, prioritized async loading with a small concurrency
 * pool; also fire-and-forgets to the backend so it can pre-extract RAW
 * previews and warm its own RAM cache concurrently.
 */
export function triggerPredictiveLookahead(
  photos: { id: number }[],
  currentIndex: number,
  getFullUrl: (id: number) => string,
  getThumbUrl: (id: number) => string,
  options: PredictiveLookaheadOptions = {}
): void {
  if (!photos || photos.length === 0 || currentIndex < 0 || currentIndex >= photos.length) return
  if (typeof window === 'undefined') return

  const runId = ++lookaheadRunId
  const offsets = getLookaheadOffsets(activeDirection)

  const queue: { photoId: number; fullUrl: string; thumbUrl: string }[] = []
  const lookaheadIds: number[] = []
  for (const offset of offsets) {
    const idx = currentIndex + offset
    if (idx < 0 || idx >= photos.length) continue
    const p = photos[idx]
    if (!p) continue
    if (lookaheadRamCache.has(p.id) || inFlightRamFetches.has(p.id)) continue
    queue.push({ photoId: p.id, fullUrl: getFullUrl(p.id), thumbUrl: getThumbUrl(p.id) })
    lookaheadIds.push(p.id)
  }

  // Backend pre-warming trigger (fire-and-forget)
  if (lookaheadIds.length > 0) {
    try {
      if (options.preloadLookahead) {
        options.preloadLookahead(lookaheadIds)
      } else {
        void api.preloadLookahead(lookaheadIds).catch(() => {})
      }
    } catch {
      // never let pre-warming break navigation
    }
  }

  // Low-priority thumbnail warming through the GPU decode path
  if (options.warmThumbnails !== false) {
    for (const item of queue) {
      void preloadAndDecodeImage(item.thumbUrl).catch(() => {})
    }
  }

  const concurrency = Math.max(1, Math.min(3, options.concurrency ?? 3))
  let cursor = 0
  const workers: Promise<void>[] = []
  const workerCount = Math.min(concurrency, queue.length)
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (runId === lookaheadRunId && cursor < queue.length) {
          const item = queue[cursor++]
          await primePhotoIntoRam(item.photoId, item.fullUrl, runId)
        }
      })()
    )
  }
  void Promise.all(workers).catch(() => {})
}
