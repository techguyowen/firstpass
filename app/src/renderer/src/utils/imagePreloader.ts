/**
 * High-performance Image Preloader and GPU Decode Engine
 * Pre-fetches and asynchronously decodes image bitmaps into Chromium GPU memory
 * ensuring instant 0ms transitions during rapid photo culling.
 */

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
