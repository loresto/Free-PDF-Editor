import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Rgb } from './model'

const MAX_DPR = 2

export function deviceRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR)
}

/** Renders a page at the given zoom into the canvas (backing store scaled for HiDPI). */
export function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  zoom: number,
): RenderTask {
  const ratio = deviceRatio()
  const viewport = page.getViewport({ scale: zoom * ratio })
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  return page.render({ canvas, viewport, background: '#ffffff' })
}

export type Box = { left: number; top: number; width: number; height: number }

/** Free horizontal space (CSS px) to the right of the box, up to the first ink. */
export function freeSpaceRight(
  canvas: HTMLCanvasElement,
  box: Box,
  background: Rgb,
  limit: number,
  // Small enough to notice the edge of a shaded cell on a white page.
  tolerance = 24,
): number {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !canvas.clientWidth) return 0
  const scaleX = canvas.width / canvas.clientWidth
  const scaleY = canvas.height / canvas.clientHeight
  const startX = Math.ceil(box.left + box.width)
  const endX = Math.ceil(Math.min(box.left + box.width + limit, canvas.clientWidth))
  const top = Math.max(0, Math.floor(box.top * scaleY))
  const bottom = Math.min(canvas.height, Math.ceil((box.top + box.height) * scaleY))
  if (endX <= startX || bottom <= top) return 0
  let image: ImageData
  try {
    image = context.getImageData(
      Math.max(0, Math.floor(startX * scaleX)),
      top,
      Math.max(1, Math.ceil((endX - startX) * scaleX)),
      bottom - top,
    )
  } catch {
    return 0
  }
  // Rules (underlines, cell separators) are thin horizontal marks: they must
  // not stop the scan, otherwise a table cell reports zero free space.
  const ruleHeight = Math.max(3, image.height * 0.35)
  for (let x = 0; x < image.width; x += 1) {
    let minY = -1
    let maxY = -1
    for (let y = 0; y < image.height; y += 1) {
      const offset = (y * image.width + x) * 4
      const difference = Math.max(
        Math.abs(image.data[offset] - background[0]),
        Math.abs(image.data[offset + 1] - background[1]),
        Math.abs(image.data[offset + 2] - background[2]),
      )
      if (difference <= tolerance) continue
      if (minY < 0) minY = y
      maxY = y
    }
    if (minY < 0) continue
    if (maxY - minY <= ruleHeight) continue
    return x / scaleX
  }
  return endX - startX
}

type Region = {
  image: ImageData
  width: number
  height: number
  scaleX: number
  scaleY: number
}

function readRegion(canvas: HTMLCanvasElement, box: Box): Region | null {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !canvas.clientWidth || !canvas.clientHeight) return null
  const scaleX = canvas.width / canvas.clientWidth
  const scaleY = canvas.height / canvas.clientHeight
  const left = Math.max(0, Math.floor(box.left * scaleX))
  const top = Math.max(0, Math.floor(box.top * scaleY))
  const right = Math.min(canvas.width, Math.ceil((box.left + box.width) * scaleX))
  const bottom = Math.min(canvas.height, Math.ceil((box.top + box.height) * scaleY))
  const width = right - left
  const height = bottom - top
  if (width < 2 || height < 2) return null
  try {
    return { image: context.getImageData(left, top, width, height), width, height, scaleX, scaleY }
  } catch {
    return null
  }
}

/**
 * Splits the box into horizontal bands and returns the dominant background
 * colour of each, so shaded rows and simple gradients are covered seamlessly.
 */
export function sampleCover(
  canvas: HTMLCanvasElement,
  box: Box,
  bands = 6,
  exclude?: Box,
): { box: Box; colors: Rgb[] } | null {
  const region = readRegion(canvas, box)
  if (!region) return null
  const { image, width, height, scaleX, scaleY } = region
  const colors: Rgb[] = []
  const bandHeight = height / bands

  // Glyph pixels must never define the patch colour: a band that cuts through
  // the letters would otherwise become a dark bar.
  const skip = exclude
    ? {
        left: (exclude.left - box.left) * scaleX,
        top: (exclude.top - box.top) * scaleY,
        right: (exclude.left + exclude.width - box.left) * scaleX,
        bottom: (exclude.top + exclude.height - box.top) * scaleY,
      }
    : null

  const sampleBand = (y0: number, y1: number) => {
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (skip && x >= skip.left && x < skip.right && y >= skip.top && y < skip.bottom) continue
        const offset = (y * width + x) * 4
        const r = image.data[offset]
        const g = image.data[offset + 1]
        const b = image.data[offset + 2]
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
        const bucket = buckets.get(key)
        if (bucket) {
          bucket.count += 1
          bucket.r += r
          bucket.g += g
          bucket.b += b
        } else {
          buckets.set(key, { count: 1, r, g, b })
        }
      }
    }
    let best: { count: number; r: number; g: number; b: number } | null = null
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) best = bucket
    }
    return best
      ? ([
          Math.round(best.r / best.count),
          Math.round(best.g / best.count),
          Math.round(best.b / best.count),
        ] as Rgb)
      : null
  }

  const global = sampleBand(0, height)
  for (let band = 0; band < bands; band += 1) {
    const y0 = Math.floor(band * bandHeight)
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((band + 1) * bandHeight)))
    colors.push(sampleBand(y0, y1) ?? global ?? [255, 255, 255])
  }

  return { box, colors }
}

/**
 * Finds the real ink bounds of the text inside the box (measured on the
 * rendered page). A tight cover hides every glyph pixel without painting over
 * table borders or the neighbouring line.
 */
export function inkBox(
  canvas: HTMLCanvasElement,
  box: Box,
  background: Rgb,
  tolerance = 42,
): Box | null {
  const padX = Math.max(2, box.width * 0.05)
  // Keep the probe close to the line: a wider window would find the ink of the
  // line above/below and grow the cover over it.
  const padY = Math.min(3, Math.max(1.5, box.height * 0.12))
  const region = readRegion(canvas, {
    left: box.left - padX,
    top: box.top - padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
  })
  if (!region) return null
  const { image, width, height, scaleX, scaleY } = region

  let minX = width
  let maxX = -1
  let minY = height
  let maxY = -1
  let ink = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const difference = Math.max(
        Math.abs(image.data[offset] - background[0]),
        Math.abs(image.data[offset + 1] - background[1]),
        Math.abs(image.data[offset + 2] - background[2]),
      )
      if (difference < tolerance) continue
      ink += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (ink < 3 || maxX < minX || maxY < minY) return null

  // Never let the cover grow past the line box by more than a hair.
  const clampLeft = box.left - 2
  const clampTop = box.top - 2
  const clampRight = box.left + box.width + 2
  const clampBottom = box.top + box.height + 2
  const left = Math.max(box.left - padX + (minX - 1) / scaleX, clampLeft)
  const top = Math.max(box.top - padY + (minY - 1) / scaleY, clampTop)
  const right = Math.min(box.left - padX + (maxX + 2) / scaleX, clampRight)
  const bottom = Math.min(box.top - padY + (maxY + 2) / scaleY, clampBottom)
  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  }
}
