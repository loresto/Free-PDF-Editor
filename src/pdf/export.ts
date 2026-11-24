import { PDFDocument, degrees, LineCapStyle, rgb, type PDFFont } from '@cantoo/pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  blankRanges,
  readPageContent,
  squash,
  textDecorations,
  type ShowOp,
} from './content'
import { stripEncryptionArtifacts } from './decrypt'
import {
  displayText,
  lineWidth,
  wrapText,
  type FontFamily,
  type ImageEdit,
  type Rgb,
  type StrokeEdit,
  type TextEdit,
} from './model'

/** Extra layers and the final page order of the exported file. */
export type ExportExtras = {
  images?: ImageEdit[]
  strokes?: StrokeEdit[]
  /** 0-based page indices in their final order; omitted pages are dropped. */
  order?: number[]
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; jpeg: boolean } | null {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { bytes, jpeg: match[1].toLowerCase() !== 'png' }
}

const FONT_FILES = {
  'sans-regular': 'NotoSans-Regular.ttf',
  'sans-bold': 'NotoSans-Bold.ttf',
  'serif-regular': 'NotoSerif-Regular.ttf',
  'serif-bold': 'NotoSerif-Bold.ttf',
} as const

type FontKey = keyof typeof FONT_FILES

const fontBytesCache = new Map<FontKey, Uint8Array>()

async function fontBytes(key: FontKey): Promise<Uint8Array> {
  const cached = fontBytesCache.get(key)
  if (cached) return cached
  const base = import.meta.env.BASE_URL || '/'
  const response = await fetch(`${base}fonts/${FONT_FILES[key]}`)
  if (!response.ok) throw new Error('Не удалось загрузить шрифт для экспорта.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  fontBytesCache.set(key, bytes)
  return bytes
}

function fontKey(font: FontFamily, bold: boolean): FontKey {
  return `${font}-${bold ? 'bold' : 'regular'}` as FontKey
}

function pdfColor([r, g, b]: Rgb) {
  return rgb(r / 255, g / 255, b / 255)
}

/**
 * Deletes replaced lines from the page content stream, so the old text is gone
 * from the file instead of being painted over. Returns the ids of edits that
 * were really removed; the rest fall back to the cover patch.
 */
function removeOriginalText(doc: PDFDocument, edits: TextEdit[]): Set<string> {
  const removed = new Set<string>()
  const pages = doc.getPages()

  for (let index = 0; index < pages.length; index += 1) {
    const onPage = edits.filter(
      (edit) => edit.page === index + 1 && edit.kind === 'replace' && edit.original,
    )
    if (!onPage.length) continue
    const content = readPageContent(doc, pages[index])
    if (!content) continue

    const used = new Set<ShowOp>()
    const ranges: { start: number; end: number; replacement?: string }[] = []
    const helpers = content.ops.filter((op) => op.explicit)

    for (const edit of onPage) {
      const target = squash(edit.original ?? '')
      if (!target) continue
      // Every cell of a table row is its own text operator on the same baseline,
      // so matching starts at the clicked x and grows rightwards until the whole
      // line is covered. It cannot swallow the next cell: the walk stops as soon
      // as the accumulated text matches.
      const reach = Math.max(1.5, Math.min(edit.size, 24) * 0.4)
      const candidates = helpers
        .filter(
          (op) =>
            !used.has(op) &&
            Math.abs(op.y - edit.y) <= Math.max(0.8, edit.size * 0.12) &&
            op.x >= edit.x - reach,
        )
        .sort((a, b) => a.x - b.x)

      const picked: ShowOp[] = []
      let accumulated = ''
      for (const op of candidates) {
        if (picked.length === 0 && Math.abs(op.x - edit.x) > reach) break
        const piece = squash(op.text)
        if (!target.startsWith(accumulated + piece)) break
        accumulated += piece
        picked.push(op)
        if (accumulated === target) break
      }

      if (!picked.length || accumulated !== target) continue
      picked.forEach((op) => used.add(op))
      ranges.push(...picked)
      // Underlines and highlights are painted separately from the glyphs, so
      // they would survive the text as stray dark bars.
      if (edit.cover) {
        for (const decoration of textDecorations(content, edit.cover, edit.size)) {
          ranges.push({ start: decoration.start, end: decoration.end, replacement: 'n' })
        }
      }
      removed.add(edit.id)
    }

    if (ranges.length) content.apply(blankRanges(content.text, ranges))
  }

  return removed
}

/**
 * Working copy used for the live preview: the original lines that can be matched
 * are cut out of the page content stream, so the page can be re-rendered without
 * any white patch. Only glyphs are removed - backgrounds, frames and shading
 * come from untouched operators and stay pixel-perfect.
 */
export async function buildPreview(
  bytes: Uint8Array,
  edits: TextEdit[],
  password?: string,
): Promise<{ bytes: Uint8Array; blanked: Set<string> } | null> {
  if (!edits.some((edit) => edit.kind === 'replace' && edit.original)) return null
  const doc = await PDFDocument.load(bytes, { password, updateMetadata: false })
  const blanked = removeOriginalText(doc, edits)
  if (!blanked.size) return null
  return { bytes: await doc.save({ useObjectStreams: false }), blanked }
}

/**
 * Writes every edit into a copy of the original file. Loading with a password
 * also drops the encryption dictionary, so the result is an unprotected PDF.
 */
export async function buildPdf(
  bytes: Uint8Array,
  edits: TextEdit[],
  password?: string,
  extras: ExportExtras = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { password, updateMetadata: false })
  if (!doc.isEncrypted) stripEncryptionArtifacts(doc)
  doc.registerFontkit(fontkit)

  const removed = removeOriginalText(doc, edits)
  const pages = doc.getPages()
  const fonts = new Map<FontKey, PDFFont>()

  for (const edit of edits) {
    const page = pages[edit.page - 1]
    if (!page) continue

    if (edit.cover && !removed.has(edit.id)) {
      const cover = edit.cover
      const width = Math.max(cover.width, 0.5)
      const height = Math.max(cover.height, 0.5)
      const bands = cover.colors?.length ? cover.colors : [cover.color]
      if (bands.length > 1) {
        // One rectangle per band keeps gradients and shaded rows invisible.
        const bandHeight = height / bands.length
        bands.forEach((color, index) => {
          page.drawRectangle({
            x: cover.x,
            y: cover.y + height - (index + 1) * bandHeight,
            width,
            height: bandHeight + 0.25,
            color: pdfColor(color),
          })
        })
      } else {
        page.drawRectangle({
          x: cover.x,
          y: cover.y,
          width,
          height,
          color: pdfColor(bands[0]),
        })
      }
    }

    const text = displayText(edit).replace(/\r/g, '')
    if (!text.trim()) continue

    const key = fontKey(edit.font, edit.bold)
    let font = fonts.get(key)
    if (!font) {
      // Subsetting in the bundled fontkit build fails on Noto tables, so the
      // full font is embedded once per used style (~220 KB, compressed).
      font = await doc.embedFont(await fontBytes(key), { subset: false })
      fonts.set(key, font)
    }

    const measure = (value: string, size: number) => font!.widthOfTextAtSize(value, size)
    const spacing = edit.letterSpacing || 0
    const leading = edit.size * (edit.lineHeight || 1.18)
    const color = pdfColor(edit.color)
    const opacity = Math.min(1, Math.max(0.05, edit.opacity ?? 1))
    const lines = wrapText(text, edit.size, edit.width, measure, spacing)

    if (edit.highlight) {
      const pad = Math.max(0, edit.highlight.padding)
      const top = edit.y + edit.size * 0.92 + pad
      const bottom = edit.y - (lines.length - 1) * leading - edit.size * 0.3 - pad
      page.drawRectangle({
        x: edit.x - pad,
        y: bottom,
        width: Math.max(edit.width, edit.size) + pad * 2,
        height: Math.max(top - bottom, edit.size * 0.4),
        color: pdfColor(edit.highlight.color),
        opacity,
      })
    }

    lines.forEach((line, index) => {
      if (!line) return
      const width = lineWidth(line, edit.size, measure, spacing)
      let x = edit.x
      if (edit.align === 'center') x += (edit.width - width) / 2
      if (edit.align === 'right') x += edit.width - width
      const y = edit.y - index * leading

      if (!spacing) {
        page.drawText(line, { x, y, size: edit.size, font: font!, color, opacity })
      } else {
        // pdf-lib has no character spacing option, so the line is laid out glyph
        // by glyph with the requested tracking.
        let cursor = x
        for (const char of line) {
          page.drawText(char, { x: cursor, y, size: edit.size, font: font!, color, opacity })
          cursor += measure(char, edit.size) + spacing
        }
      }

      const ruleHeight = Math.max(0.6, edit.size * 0.06)
      if (edit.underline) {
        page.drawRectangle({
          x,
          y: y - edit.size * 0.14,
          width,
          height: ruleHeight,
          color,
          opacity,
        })
      }
      if (edit.strike) {
        page.drawRectangle({
          x,
          y: y + edit.size * 0.29,
          width,
          height: ruleHeight,
          color,
          opacity,
        })
      }
    })
  }

  for (const image of extras.images ?? []) {
    const page = pages[image.page - 1]
    const file = decodeDataUrl(image.dataUrl)
    if (!page || !file) continue
    const embedded = file.jpeg ? await doc.embedJpg(file.bytes) : await doc.embedPng(file.bytes)
    // pdf-lib rotates around the image origin, so the origin is shifted to keep
    // the picture spinning in place around its centre.
    const angle = image.rotation || 0
    const radians = (angle * Math.PI) / 180
    const centerX = image.x + image.width / 2
    const centerY = image.y + image.height / 2
    const originX = angle
      ? centerX - ((image.width / 2) * Math.cos(radians) - (image.height / 2) * Math.sin(radians))
      : image.x
    const originY = angle
      ? centerY - ((image.width / 2) * Math.sin(radians) + (image.height / 2) * Math.cos(radians))
      : image.y
    page.drawImage(embedded, {
      x: originX,
      y: originY,
      width: Math.max(1, image.width),
      height: Math.max(1, image.height),
      opacity: Math.min(1, Math.max(0.05, image.opacity ?? 1)),
      rotate: degrees(angle),
    })
  }

  for (const stroke of extras.strokes ?? []) {
    const page = pages[stroke.page - 1]
    if (!page || stroke.points.length < 2) continue
    for (let index = 1; index < stroke.points.length; index += 1) {
      const [x1, y1] = stroke.points[index - 1]
      const [x2, y2] = stroke.points[index]
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: Math.max(0.3, stroke.width),
        color: pdfColor(stroke.color),
        opacity: Math.min(1, Math.max(0.05, stroke.opacity ?? 1)),
        lineCap: LineCapStyle.Round,
      })
    }
  }

  const order = extras.order
  const isIdentity =
    !order || order.every((value, index) => value === index)
  if (isIdentity) return doc.save({ useObjectStreams: false })

  // Removing or reordering pages: the edited pages are copied in the requested
  // order into a fresh document, which also drops the untouched pages.
  const target = await PDFDocument.create()
  const copied = await target.copyPages(doc, order)
  copied.forEach((page) => target.addPage(page))
  return target.save({ useObjectStreams: false })
}
